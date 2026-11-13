"use client";

import React from 'react';
import { FirstRunSetupGuide } from './FirstRunSetupGuide';

/**
 * Re-exports and wraps FirstRunSetupGuide for backwards compatibility and integration.
 * Shows the persistent 5-step first-run checklist when in progress, and the simple
 * "Setup complete" state once all steps are completed.
 */
export function SetupCompleteBanner() {
  return <FirstRunSetupGuide />;
}

export { FirstRunSetupGuide };
