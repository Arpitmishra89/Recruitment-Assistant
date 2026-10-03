from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.matching_routes import router as matching_router
from app.api.routes.voice_routes import router as voice_router

app = FastAPI(
    title="AI Recruitment Assistant",
    description="Job description and resume matching API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "AI Recruitment Assistant API",
        "status": "running"
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


app.include_router(matching_router)
app.include_router(voice_router)