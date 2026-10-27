# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
from pydantic import BaseModel, ConfigDict, Field, StrictBool


class LightCommand(BaseModel):
    on: StrictBool
    expected_revision: int = Field(ge=0)


class LightPowerConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    watts: float = Field(gt=0, le=10000, allow_inf_nan=False, strict=True)


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
