.PHONY: setup up down seed check logs
setup:
	node scripts/setup.mjs
up:
	docker compose up --build -d --wait
down:
	docker compose down
seed:
	docker compose exec flare-api pnpm db:migrate
	docker compose exec flare-api pnpm seed
check:
	bash scripts/checkpoint.sh
logs:
	docker compose logs -f --tail 100
