# 7-Eleven — one-command entry points.
#
# Only the frontend exists for now. Backend targets get added here when the team
# picks a stack (keep the same verbs: dev / check / test / build).

FRONTEND := apps/frontend
PNPM     := pnpm --dir $(FRONTEND)

.DEFAULT_GOAL := help
.PHONY: help fe-install fe-dev fe-check fe-types fe-lint fe-format fe-build fe-start fe-clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# --- frontend ---------------------------------------------------------------

fe-install: ## Install frontend dependencies
	@$(PNPM) install

fe-dev: ## Run the frontend dev server on http://localhost:3711
	@$(PNPM) dev

fe-check: fe-types fe-lint ## Type check + lint (the gate before calling work done)

fe-types: ## next typegen + tsc --noEmit
	@$(PNPM) check-types

fe-lint: ## ESLint
	@$(PNPM) lint

fe-format: ## Prettier (incl. Tailwind class sorting)
	@$(PNPM) format

fe-build: ## Production build
	@$(PNPM) build

fe-start: ## Serve the production build on :3711
	@$(PNPM) start

fe-clean: ## Remove build output
	@rm -rf $(FRONTEND)/.next
