export function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay(),
        diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
}
