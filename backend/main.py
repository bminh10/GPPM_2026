# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.analytics.analytics import router as routerAnalytics
from app.approvals.approvals import router as routerApprovals
from app.auth.auth import router as routerAuth
from app.campus.campus import router as routerCampus
from app.classes.classes import router as routerClasses
from app.dashboard.dashboard import router as routerDashboard
from app.majors.majors import router as routerMajors
from app.optimization.optimization import router as routerOptimization
from app.registrations.registrations import router as routerRegistrations
from app.resources.resources import router as routerResources
from app.rooms.rooms import router as routerRooms
from app.faculty.faculty import router as routerFaculties
from app.schedules.schedules import router as routerSchedules
from app.semesters.semesters import router as routerSemesters
from app.subjects.subjects import router as routerSubjects
from app.time_slots.time_slots import router as routerTimeSlots
from app.users.users import router as routerUsers
from core.config import CORS_ORIGINS
from db.middleware.audit import AuditLogMiddleware
from db.middleware.auth import AuthMiddleware
from app.lighting.router import router as routerLighting, device_router
from app.cards.router import router as routerCards
from app.cards.writer import router as routerCardWriter
from app.cards.attendance import router as routerCardAttendance

app = FastAPI(version="1.1")
# 1.0 base version
# 1.1 database shcema changes, new endpoints and features.


for router in (
    routerAuth,
    routerApprovals,
    routerUsers,
    routerCampus,
    routerFaculties,
    routerMajors,
    routerClasses,
    routerRooms,
    routerSubjects,
    routerSemesters,
    routerTimeSlots,
    routerSchedules,
    routerRegistrations,
    routerDashboard,
    routerAnalytics,
    routerOptimization,
    routerResources,
    routerLighting,
    device_router,
    routerCards,
    routerCardWriter,
    routerCardAttendance,
):
    app.include_router(router)

# Middleware thêm sau sẽ chạy ngoài cùng: CORS phải ngoài cùng để cả phản hồi 401 cũng có header CORS
app.add_middleware(AuditLogMiddleware)
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "OK"}


@app.get("/health")
async def health():
    return {"status": "OK"}
