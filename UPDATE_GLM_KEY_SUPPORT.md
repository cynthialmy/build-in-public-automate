# GLM API Key Support Added

## Summary

Added support for using `GLM_API_KEY` as an alternative to `ANTHROPIC_API_KEY`. Users can now use either environment variable to configure their AI provider.

## Changes Made

### 1. AI Modules

#### `src/ai/drafter.ts`
- Changed API key check to support both `GLM_API_KEY` and `ANTHROPIC_API_KEY`
- Updated error message to indicate both options
- Uses whichever key is available (GLM takes precedence)

```typescript
const apiKey = process.env.GLM_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error(
    'API key not set. Set either GLM_API_KEY or ANTHROPIC_API_KEY environment variable.'
  );
}
```

#### `src/ai/evolver.ts`
- Updated `getClient()` function to support both API keys
- Same pattern as drafter for consistency

### 2. Command Modules

#### `src/commands/soul.ts`
- Updated API key check for soul evolution command
- Supports both `GLM_API_KEY` and `ANTHROPIC_API_KEY`

#### `src/commands/draft.ts`
- Updated API key check for draft generation command
- Supports both `GLM_API_KEY` and `ANTHROPIC_API_KEY`

#### `src/commands/evolve.ts`
- Updated API key check for project doc evolution command
- Supports both `GLM_API_KEY` and `ANTHROPIC_API_KEY`

#### `src/commands/doctor.ts`
- Updated API key check in diagnostic output
- Shows which key type is set (GLM or ANTHROPIC)

```typescript
const keyType = process.env.GLM_API_KEY ? 'GLM_API_KEY' : 'ANTHROPIC_API_KEY';
if (process.env.ANTHROPIC_API_KEY || process.env.GLM_API_KEY) {
  ok(`${keyType} set`);
} else {
  fail(
    'API key not set',
    'export GLM_API_KEY=your-key or export ANTHROPIC_API_KEY=sk-ant-...'
  );
}
```

## Usage

Users can now set either environment variable:

```bash
# Option 1: Use GLM API key
export GLM_API_KEY=your-glm-key-here

# Option 2: Use Anthropic API key (original)
export ANTHROPIC_API_KEY=sk-ant-api03...

# Run bip commands
bip draft
bip post
bip evolve
```

## Benefits

1. **Flexibility**: Users can choose their preferred AI provider
2. **Backward Compatibility**: Existing `ANTHROPIC_API_KEY` usage still works
3. **Precedence**: `GLM_API_KEY` takes precedence if both are set
4. **Consistent Error Messages**: All commands now reference both key types

## Testing

All modified functions should work with either:
- `GLM_API_KEY` set (new key type)
- `ANTHROPIC_API_KEY` set (original key type)
- Neither set (proper error message)

The actual AI model usage (`claude-sonnet-4-6`) remains the same - only the API key source changes.
