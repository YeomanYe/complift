import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';

// Scaffold smoke test: verifies the vitest + jsdom + Testing Library setup works.
test('renders into jsdom', () => {
  render(<div>complift</div>);
  expect(screen.getByText('complift')).toBeDefined();
});
