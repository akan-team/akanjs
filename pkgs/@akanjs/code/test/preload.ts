// Ink reads CI once at import and then writes no frame until unmount, so the terminal suites would read empty frames.
delete process.env.CI;
delete process.env.CONTINUOUS_INTEGRATION;
