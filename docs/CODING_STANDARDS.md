# Coding Standards

## General
- Use TypeScript strict mode
- Prefer named exports over default exports
- Use async/await over promises
- Always handle errors explicitly

## File Organization
- One class/interface per file
- File names: `kebab-case.ts`
- Folders: `kebab-case`
- Index files for public API only

## Code Style
- Use 2 spaces for indentation
- Use single quotes for strings
- Semicolons required
- Trailing commas in multi-line objects/arrays
- Max line length: 100 characters

## Naming
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/interfaces: `PascalCase` (suffix with `Type` if ambiguous)

## Architecture
- **Core**: Framework infrastructure only
- **Modules**: Business logic, domain-specific
- **Shared**: Reusable utilities, types, constants
- **System**: Cross-cutting concerns (cache, logs, CLI)

## Best Practices
- Keep functions small and focused
- Avoid deep nesting (max 3 levels)
- Use early returns
- Document public APIs with JSDoc
- No `any` types (use `unknown` if needed)

