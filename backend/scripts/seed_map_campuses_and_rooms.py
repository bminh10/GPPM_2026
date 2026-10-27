# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import json
import unicodedata
from pathlib import Path

from db.database import Campus, PhongHoc, SessionLocal


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MAP_DATA_ROOT = REPOSITORY_ROOT / "frontend" / "src" / "data"
CAMPUS_DATA = {
    "cs1": {
        "name": "Cơ sở 1 - 97 Võ Văn Tần",
        "address": "97 Võ Văn Tần",
        "aliases": ("võ văn tần", "97 võ văn tần"),
    },
    "cs3": {
        "name": "Cơ sở 3 - Nhà Bè",
        "address": "Khu Dân Cư Nhơn Đức",
        "aliases": ("nhà bè", "nhơn đức"),
    },
}


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.casefold())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn")


def load_features(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as source:
        collection = json.load(source)
    features = collection.get("features")
    if not isinstance(features, list):
        raise ValueError(f"{path} has no GeoJSON features array")
    return features


def resolve_campus(db, config: dict, campuses: list[Campus]) -> tuple[Campus, bool]:
    aliases = tuple(normalize(alias) for alias in config["aliases"])
    matches = [
        campus
        for campus in campuses
        if any(
            alias in normalize(f"{campus.name} {campus.address or ''}")
            for alias in aliases
        )
    ]
    if len(matches) > 1:
        raise ValueError(f"Campus aliases are ambiguous for {config['name']}")
    if matches:
        return matches[0], False

    campus = Campus(name=config["name"], address=config["address"])
    db.add(campus)
    db.flush()
    campuses.append(campus)
    return campus, True


def main() -> None:
    inserted_campuses = 0
    inserted_rooms = 0
    updated_rooms = 0
    campus_room_counts: dict[str, int] = {}

    with SessionLocal.begin() as db:
        campuses = db.query(Campus).order_by(Campus.id).all()
        for data_key, config in CAMPUS_DATA.items():
            campus, was_created = resolve_campus(db, config, campuses)
            inserted_campuses += int(was_created)

            buildings = {
                str(feature["properties"]["id"]): str(feature["properties"]["name"])
                for feature in load_features(MAP_DATA_ROOT / data_key / "building.geojson")
                if feature["properties"].get("kind") == "building"
            }
            room_features = [
                feature
                for feature in load_features(MAP_DATA_ROOT / data_key / "room-3d.geojson")
                if feature["properties"].get("kind") == "room"
            ]

            for feature in room_features:
                properties = feature["properties"]
                room_name = str(properties["id"]).strip()
                building_id = str(properties["buildingId"]).strip()
                building_name = buildings.get(building_id)
                if building_name is None:
                    building_name = next(
                        (
                            name
                            for feature_id, name in buildings.items()
                            if feature_id.split(".")[-1].casefold()
                            == building_id.split(".")[-1].casefold()
                        ),
                        None,
                    )
                if building_name is None:
                    raise ValueError(f"Room {room_name} refers to an unknown building")

                capacity = int(properties["capacity"])
                room = (
                    db.query(PhongHoc)
                    .filter(
                        PhongHoc.campus_id == campus.id,
                        PhongHoc.name == room_name,
                    )
                    .first()
                )
                if room is None:
                    db.add(
                        PhongHoc(
                            name=room_name,
                            building=building_name,
                            capacity=capacity,
                            is_thuc_hanh=False,
                            campus_id=campus.id,
                        )
                    )
                    inserted_rooms += 1
                else:
                    changed = room.building != building_name or room.capacity != capacity
                    room.building = building_name
                    room.capacity = capacity
                    updated_rooms += int(changed)
                campus_room_counts[config["name"]] = (
                    campus_room_counts.get(config["name"], 0) + 1
                )

    print(
        json.dumps(
            {
                "campuses_created": inserted_campuses,
                "rooms_created": inserted_rooms,
                "rooms_updated": updated_rooms,
                "rooms_by_campus": campus_room_counts,
            },
            ensure_ascii=True,
        )
    )


if __name__ == "__main__":
    main()
