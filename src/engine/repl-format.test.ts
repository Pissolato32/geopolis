import { describe, it, expect } from 'vitest';
import { formatActionResponse } from './repl-format.js';

describe('REPL Formatter Security Tests', () => {
  it('should not include sensitive metadata like eventId in action response', () => {
    const actionType = 'test_action';
    const response = formatActionResponse(actionType) as any;

    expect(response.actionType).toBe(actionType);
    expect(response.status).toBe('processed');

    // Explicitly check for absence of sensitive fields
    expect(response.eventId).toBeUndefined();
    expect(response.params).toBeUndefined();
    expect(response.actorId).toBeUndefined();
  });
});
