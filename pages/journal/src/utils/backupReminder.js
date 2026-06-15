export const BACKUP_REMINDER_SETTINGS_DOC = 'backupReminder';

export const BACKUP_REMINDER_OPTIONS = [
    {
        value: 'weekly',
        label: 'Weekly',
        description: 'A steady reminder without getting noisy.',
        intervalMs: 7 * 24 * 60 * 60 * 1000
    },
    {
        value: 'daily',
        label: 'Daily',
        description: 'Useful during heavy journaling periods.',
        intervalMs: 24 * 60 * 60 * 1000
    },
    {
        value: 'monthly',
        label: 'Monthly',
        description: 'A lighter maintenance rhythm.',
        intervalMs: 30 * 24 * 60 * 60 * 1000
    },
    {
        value: 'every-save',
        label: 'Every save',
        description: 'Show the reminder after every manual save.',
        intervalMs: 0
    },
    {
        value: 'never',
        label: 'Never',
        description: 'Only open backups manually from Settings.',
        intervalMs: null
    }
];

export const DEFAULT_BACKUP_REMINDER_FREQUENCY = 'weekly';

export function normalizeBackupReminderSettings(settings) {
    const allowedValues = new Set(BACKUP_REMINDER_OPTIONS.map((option) => option.value));
    const frequency = allowedValues.has(settings?.frequency)
        ? settings.frequency
        : DEFAULT_BACKUP_REMINDER_FREQUENCY;

    return {
        frequency,
        lastReminderAtClient: typeof settings?.lastReminderAtClient === 'string'
            ? settings.lastReminderAtClient
            : null
    };
}

export function getBackupReminderOption(frequency) {
    return BACKUP_REMINDER_OPTIONS.find((option) => option.value === frequency)
        || BACKUP_REMINDER_OPTIONS.find((option) => option.value === DEFAULT_BACKUP_REMINDER_FREQUENCY);
}

export function shouldShowBackupReminder(settings, now = new Date()) {
    const normalizedSettings = normalizeBackupReminderSettings(settings);
    const option = getBackupReminderOption(normalizedSettings.frequency);

    if (!option || option.value === 'never') return false;
    if (option.value === 'every-save') return true;
    if (!normalizedSettings.lastReminderAtClient) return true;

    const lastReminderTime = new Date(normalizedSettings.lastReminderAtClient).getTime();
    if (Number.isNaN(lastReminderTime)) return true;

    return now.getTime() - lastReminderTime >= option.intervalMs;
}
