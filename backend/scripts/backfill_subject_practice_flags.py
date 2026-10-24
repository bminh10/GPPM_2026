from sqlalchemy.exc import SQLAlchemyError

from app.subjects.subject_rules import configured_practical_subject_codes
from db.database import MonHoc, SessionLocal


def main() -> None:
    practical_codes = configured_practical_subject_codes()
    if not practical_codes:
        raise RuntimeError(
            "Set PRACTICAL_SUBJECT_CODES before backfilling existing subjects."
        )

    db = SessionLocal()
    try:
        subjects = db.query(MonHoc).all()
        updated_count = 0
        for subject in subjects:
            if subject.code.strip().casefold() in practical_codes and not subject.is_thuc_hanh:
                subject.is_thuc_hanh = True
                updated_count += 1
        db.commit()
        print(f"Marked {updated_count} configured practical subject(s).")
    except SQLAlchemyError:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
