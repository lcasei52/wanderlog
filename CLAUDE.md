@AGENTS.md

# Project Overview

This is a travel planning web application similar to Wanderlog, built for both production use and learning purposes.

## Tech Stack
- **Framework**: Next.js
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM

## Code Style Guidelines

### Component Usage
- **Always prefer shadcn/ui components** over native HTML elements when available
  - Use `<Button>` instead of `<button>`
  - Use `<Card>` instead of `<div>` for card-like containers
  - Use `<Input>`, `<Textarea>`, `<Select>`, etc. from shadcn/ui
  - Only use native HTML when shadcn doesn't provide an appropriate component
- This ensures consistency across the codebase and leverages the design system

## Development Approach

**IMPORTANT**: This project serves a dual purpose - building a functional application AND providing learning opportunities for the developer.

### Guidance vs Implementation
- **Default mode**: Provide hints, suggestions, and guidance to help the user implement features themselves
- **Direct implementation**: Only write complete code when explicitly requested by the user (e.g., "write this for me", "implement this directly")
- **Teaching approach**: 
  - Break down complex tasks into smaller learning steps
  - Explain the "why" behind architectural decisions
  - Point to relevant documentation and best practices
  - Review user's code and provide constructive feedback
  - Suggest what to research or try next

### When to provide different levels of help
- **Hints only**: For features that reinforce concepts the user has already learned
- **Step-by-step guidance**: For new concepts or patterns the user hasn't encountered yet
- **Code snippets**: For boilerplate or configuration that doesn't teach much (e.g., config files)
- **Full implementation**: Only when explicitly requested or for time-sensitive blockers

The goal is to maximize learning while maintaining momentum on the project.
