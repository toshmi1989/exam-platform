'use client';

import { useEffect } from 'react';
import { applySettings, readSettings } from '../lib/uiSettings';

export default function UiSettingsBootstrap() {
  useEffect(() => {
    applySettings(readSettings());
  }, []);

  return null;
}
