import { useSyncExternalStore } from 'react';

function subscribeToWidth(onChange) {
    window.addEventListener('resize', onChange);
    return () => window.removeEventListener('resize', onChange);
}

function columnCount() {
    return window.innerWidth >= 1024 ? 4 : window.innerWidth >= 768 ? 3 : 2;
}

// Separate columns avoid WebKit losing image layers when CSS multicolumn cards
// move between columns after a caption or viewport changes their height.
export default function PhotoMasonry({ photos, children, columnCount: fixedColumnCount }) {
    const responsiveCount = useSyncExternalStore(subscribeToWidth, columnCount, () => 2);
    const count = fixedColumnCount ?? responsiveCount;
    const columns = Array.from({ length: count }, () => []);
    photos.forEach((photo, index) => columns[index % count].push({ photo, index }));

    return (
        <div className="grid gap-2 sm:gap-4" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
            {columns.map((column, index) => (
                <div key={index} className="flex min-w-0 flex-col gap-2 sm:gap-4">
                    {column.map(({ photo, index: photoIndex }) => children(photo, photoIndex))}
                </div>
            ))}
        </div>
    );
}
