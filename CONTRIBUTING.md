# Contributing to Percent Protocol

Thank you for your interest in contributing to Percent Protocol! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

Before contributing, ensure you have:
- Node.js 18+ and pnpm installed
- PostgreSQL 14+
- Solana CLI tools
- Familiarity with TypeScript, Solana, and React

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/percent.git
   cd percent
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   cd ui && pnpm install
   ```

3. **Environment Configuration**
   - Copy `.env.example` to `.env` and configure
   - Copy `ui/.env.example` to `ui/.env.local` and configure
   - Generate a Solana keypair: `solana-keygen new --outfile wallet.json`

4. **Database Setup**
   ```bash
   createdb percent_db
   # Run migrations (if available)
   ```

5. **Start Development Servers**
   ```bash
   # Terminal 1 - Backend API
   pnpm dev

   # Terminal 2 - WebSocket Server
   pnpm ws:price

   # Terminal 3 - Frontend UI
   cd ui && pnpm dev
   ```

6. **Verify Setup**
   - Backend API: http://localhost:3001
   - Frontend UI: http://localhost:3000

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

**Good bug reports include:**
- Clear, descriptive title
- Exact steps to reproduce
- Expected vs actual behavior
- Screenshots (if applicable)
- Environment details (OS, Node version, etc.)

**Create bug reports at:** https://github.com/your-org/percent/issues

### Suggesting Features

Feature suggestions are welcome! Please:
- Check existing issues and discussions first
- Clearly describe the feature and its benefits
- Explain why it's valuable for Percent Protocol
- Consider implementation complexity

### Pull Requests

#### Before You Start

1. **Check existing issues** - See if your idea is already being worked on
2. **Discuss large changes** - Open an issue first to discuss significant changes
3. **Small, focused PRs** - Smaller PRs are easier to review and merge

#### PR Process

1. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

2. **Make Your Changes**
   - Write clean, maintainable code
   - Follow existing code style
   - Add tests for new functionality
   - Update documentation

3. **Test Your Changes**
   ```bash
   # Run tests
   pnpm test

   # Build to check for TypeScript errors
   pnpm build
   cd ui && pnpm build
   ```

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

   Use [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `refactor:` - Code refactoring
   - `test:` - Adding tests
   - `chore:` - Maintenance tasks

5. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

   Then open a PR on GitHub with:
   - Clear description of changes
   - Reference any related issues
   - Screenshots for UI changes
   - Testing instructions

#### PR Review Process

- Maintainers will review your PR
- Address any requested changes
- Once approved, your PR will be merged
- Be patient and responsive to feedback

## Code Style Guidelines

### TypeScript

- Use strict TypeScript with proper typing
- Avoid `any` types - use proper type definitions
- Use interfaces for object shapes
- Document complex functions with JSDoc comments

### Code Organization

- Keep files focused and modular
- Use clear, descriptive names
- Follow existing project structure
- Separate concerns (business logic, UI, API)

### Testing

- Write tests for new features
- Ensure existing tests pass
- Test edge cases and error conditions
- Use meaningful test descriptions

### Documentation

- Update README.md for user-facing changes
- Update CLAUDE.md for architecture changes
- Add inline comments for complex logic
- Document API endpoints and parameters

## Project Structure

```
percent/
├── app/              # Core protocol logic
│   ├── moderator.ts  # Moderator management
│   ├── proposal.ts   # Proposal lifecycle
│   ├── amm.ts        # AMM implementation
│   ├── vault.ts      # Token vault system
│   └── services/     # Business logic services
├── src/              # REST API
│   ├── routes/       # API endpoints
│   ├── middleware/   # Express middleware
│   └── server.ts     # Server entry point
├── server/           # WebSocket server
├── ui/               # Next.js frontend
│   ├── app/          # App router pages
│   ├── components/   # React components
│   ├── hooks/        # Custom hooks
│   └── lib/          # Utilities
├── scripts/          # Utility scripts
└── docs/             # Documentation
```

## Key Technologies

- **Backend**: Express, TypeScript, PostgreSQL
- **Blockchain**: Solana web3.js, Anchor, SPL Token
- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **AMM**: Meteora CP-AMM SDK
- **Authentication**: Privy

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Run specific test file
pnpm test path/to/test.ts
```

## Common Issues

### Database Connection Fails
- Ensure PostgreSQL is running
- Check `DB_URL` in `.env`
- Verify database exists: `psql -l`

### TypeScript Errors
- Run `pnpm build` to see all errors
- Ensure dependencies are installed: `pnpm install`

### RPC Connection Issues
- Check `SOLANA_RPC_URL` in `.env`
- Try a different RPC provider if rate-limited

### TradingView Charts Not Loading
- Follow setup instructions in `ui/SETUP_TRADINGVIEW.md`
- Obtain license from TradingView first

## Security

**DO NOT:**
- Commit `.env` files or sensitive credentials
- Commit `wallet.json` keypairs
- Include API keys or secrets in code
- Push database credentials

**DO:**
- Use environment variables for all secrets
- Report security vulnerabilities privately (see SECURITY.md)
- Follow secure coding practices
- Validate all user inputs

## License

By contributing to Percent Protocol, you agree that your contributions will be licensed under the AGPL-3.0 License.

This means:
- Your code will be open source
- Modifications must also be open sourced
- Network use triggers license obligations
- Commercial use is allowed

See [LICENSE](./LICENSE) for full details.

## Questions?

- **Bug reports**: GitHub Issues
- **Feature discussions**: GitHub Discussions
- **General questions**: GitHub Issues or Discord (if available)
- **Security issues**: See [SECURITY.md](./SECURITY.md)

## Recognition

Contributors are recognized in:
- Git commit history
- Release notes for significant contributions
- GitHub contributors page

Thank you for contributing to Percent Protocol! 🎉
