from fastapi import FastAPI
from app.api.auth import router


app = FastAPI()

app.include_router(router)

@app.get("/")
async def root():
    return {"message": "OK"}

@app.get("/health")
async def health():
    return {"status": "memaybel"}
@app.get("/all")
async def all():
    return 0
