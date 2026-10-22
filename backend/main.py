from fastapi import FastAPI, Request
from app.analytics.analytics import router as routerAnalytics
from app.auth.auth import router as routerAuth
from app.campus.campus import router as routerCampus
from app.dashboard.dashboard import router as routerDashboard
from app.optimization.optimization import router as routerOptimization
from app.resources.resources import router as routerResources
from app.rooms.rooms import router as routerRooms
from app.classes.classes import router as routerClasses
from app.faculty.faculty import router as routerFaculties
from app.schedules.schedules import router as routerSchedules
from app.semesters.semesters import router as routerSemesters
from app.time_slots.time_slots import router as routerTimeSlots
from app.majors.majors import router as routerMajors
from app.subjects.subjects import router as routerSubjects
from db.database import AuditLog, SessionLocal
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(version="1.0")

app.include_router(routerAuth)
app.include_router(routerCampus)
app.include_router(routerSemesters)
app.include_router(routerTimeSlots)
app.include_router(routerSchedules)
app.include_router(routerRooms)
app.include_router(routerDashboard)
app.include_router(routerAnalytics)
app.include_router(routerClasses)
app.include_router(routerFaculties)
app.include_router(routerMajors)
app.include_router(routerSubjects)
app.include_router(routerOptimization)
app.include_router(routerResources)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
