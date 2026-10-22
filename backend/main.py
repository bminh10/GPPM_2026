from fastapi import FastAPI, Request
from app.analytics.analytics import router as routerAnalytics
from app.auth.auth import router as routerAuth
from app.campus.campus import router as routerCampus
from app.dashboard.dashboard import router as routerDashboard
from app.optimization.optimization import router as routerOptimization
from app.resources.resources import router as routerResources
from app.rooms.rooms import router as routerRooms
from app.schedules.schedules import router as routerSchedules
from app.semesters.semesters import router as routerSemesters
from app.time_slots.time_slots import router as routerTimeSlots
from db.database import AuditLog, SessionLocal

app = FastAPI(version="1.0")

app.include_router(routerAuth)
app.include_router(routerCampus)
app.include_router(routerSemesters)
app.include_router(routerTimeSlots)
app.include_router(routerSchedules)
app.include_router(routerRooms)
app.include_router(routerDashboard)
app.include_router(routerAnalytics)
app.include_router(routerOptimization)
app.include_router(routerResources)


@app.middleware("http")
async def record_audit_log(request: Request, call_next):
    response = await call_next(request)
    is_mutation = request.method in {"PATCH", "PUT", "DELETE"} or (
        request.method == "POST"
        and request.url.path not in {
            "/schedules/check-conflicts",
            "/optimization/room-allocation",
            "/user/login",
        }
    )
    if is_mutation:
        with SessionLocal() as db:
            db.add(
                AuditLog(
                    method=request.method,
                    path=request.url.path,
                    status_code=response.status_code,
                )
            )
            db.commit()
    return response

@app.get("/")
async def root():
    return {"message": "OK"}

@app.get("/health")
async def health():
    return {"status": "OK"}
