from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.analytics.analytics import router as routerAnalytics
from app.auth.auth import router as routerAuth
from app.campus.campus import router as routerCampus
from app.classes.classes import router as routerClasses
from app.dashboard.dashboard import router as routerDashboard
from app.majors.majors import router as routerMajors
from app.optimization.optimization import router as routerOptimization
from app.resources.resources import router as routerResources
from app.rooms.rooms import router as routerRooms
from app.schedules.schedules import router as routerSchedules
from app.semesters.semesters import router as routerSemesters
from app.subjects.subjects import router as routerSubjects
from app.time_slots.time_slots import router as routerTimeSlots
from app.users.users import router as routerUsers
from core.config import CORS_ORIGINS
from middleware.audit import AuditLogMiddleware
from middleware.auth import AuthMiddleware

app = FastAPI(version="1.0")

for router in (
    routerAuth,
    routerUsers,
    routerCampus,
    routerMajors,
    routerClasses,
    routerRooms,
    routerSubjects,
    routerSemesters,
    routerTimeSlots,
    routerSchedules,
    routerDashboard,
    routerAnalytics,
    routerOptimization,
    routerResources,
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
