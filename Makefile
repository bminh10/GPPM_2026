.PHONY: help backend-install backend-run backend-seed frontend-install frontend-dev frontend-build frontend-deploy docker-build docker-run

PYTHON ?= python
PORT ?= 8000

help:
	@echo "Các lệnh có sẵn:"
	@echo "  make backend-install   Cài thư viện backend (tạo .venv trước)"
	@echo "  make backend-run       Chạy backend tại cổng $(PORT)"
	@echo "  make backend-seed      Nạp dữ liệu cơ sở và phòng mẫu"
	@echo "  make frontend-install  Cài thư viện frontend"
	@echo "  make frontend-dev      Chạy frontend ở chế độ phát triển"
	@echo "  make frontend-build    Build frontend ra thư mục dist"
	@echo "  make frontend-deploy   Build và deploy frontend lên Cloudflare"
	@echo "  make docker-build      Build image backend từ thư mục gốc"
	@echo "  make docker-run        Chạy image backend tại cổng $(PORT)"

backend-install:
	cd backend && $(PYTHON) -m pip install -r requirements.txt

backend-run:
	cd backend && uvicorn main:app --reload --port $(PORT)

backend-seed:
	cd backend && $(PYTHON) scripts/seed_map_campuses_and_rooms.py

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

frontend-deploy: frontend-build
	cd frontend && npx wrangler deploy

docker-build:
	docker build -f backend/Dockerfile -t smartou-backend .

docker-run:
	docker run --rm -p $(PORT):8000 -e PORT=8000 smartou-backend
