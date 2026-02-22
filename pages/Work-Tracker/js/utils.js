export function getStartOfWeekDate(d, offsetDays = 0) {
    // offsetDays: 0 = Sunday, 1 = Monday
    const date = new Date(d);
    let day = date.getDay();
    // Calculate difference to get back to the start of the defined week
    const diff = date.getDate() - day + (day < offsetDays ? -7 : 0) + offsetDays;

    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

export function formatDuration(ms) {
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
        return `${minutes}m`;
    } else if (minutes === 0) {
        return `${hours}h`;
    } else {
        return `${hours}h ${minutes}m`;
    }
}

export function formatDateTimeLocal(dateInput) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}
