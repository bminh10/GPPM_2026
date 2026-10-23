from pydantic import BaseModel, ConfigDict, Field, StrictBool


class LightCommand(BaseModel):
    on: StrictBool
    expected_revision: int = Field(ge=0)


class LightReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    light_id: str = Field(min_length=1, max_length=80)
    on: StrictBool
    revision: int = Field(ge=-1)


class DeviceReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str = Field(min_length=1, max_length=36)
    sequence: int = Field(ge=0, le=2_000_000_000)
    lights: list[LightReport] = Field(min_length=1, max_length=64)
