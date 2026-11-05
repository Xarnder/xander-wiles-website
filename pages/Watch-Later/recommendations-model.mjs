export const OWNER_EMAIL = 'xanderwiles@gmail.com';
export const PUBLIC_COLLECTION = 'publicRecommendations';
export const TIERS = [
    {
        id: 'S',
        name: 'The essentials',
        description: 'The ones I keep recommending.',
    },
    {
        id: 'A',
        name: 'Highly recommended',
        description: 'An excellent way to spend an evening.',
    },
    {
        id: 'B',
        name: 'Worth a watch',
        description: 'Good stories with plenty to enjoy.',
    },
    {
        id: 'C',
        name: 'For the right mood',
        description: 'Something here, if it sounds like your thing.',
    },
    {
        id: 'D',
        name: 'A little more niche',
        description: 'For the curious and the completists.',
    },
];

export function isOwner(user) {
    return user?.email === OWNER_EMAIL && user.emailVerified === true;
}

export function safeImageUrl(value) {
    if (!value) return '';
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password
            ? url.href
            : '';
    } catch {
        return '';
    }
}

export function youtubeId(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password)
            return '';
        let id = '';
        if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
        if (
            ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(
                url.hostname,
            )
        ) {
            id =
                url.pathname === '/watch'
                    ? url.searchParams.get('v')
                    : url.pathname.match(
                          /^\/(?:embed|shorts|live)\/([^/]+)$/,
                      )?.[1];
        }
        return /^[\w-]{11}$/.test(id || '') ? id : '';
    } catch {
        return '';
    }
}

// Deliberately build a new public record: never spread a private watch document here.
export function recommendationPayload(input) {
    const title = String(input.title || '').trim();
    const note = String(input.note || '').trim();
    const genre = String(input.genre || '').trim();
    const year = String(input.year || '').trim();
    const imageUrl = String(input.imageUrl || '').trim();
    const trailerUrl = String(input.trailerUrl || '').trim();
    const rank = Number(input.rank);
    if (!title || title.length > 160)
        throw new Error('Enter a title of up to 160 characters.');
    if (!['movie', 'tv'].includes(input.type))
        throw new Error('Choose Movie or TV show.');
    if (!TIERS.some((tier) => tier.id === input.tier))
        throw new Error('Choose a tier.');
    if (note.length > 1000 || genre.length > 80)
        throw new Error(
            'Keep notes under 1,001 characters and genre under 81.',
        );
    if (year && !/^\d{4}$/.test(year))
        throw new Error('Enter a four-digit release year.');
    if (!Number.isInteger(rank) || rank < 0 || rank > 9999)
        throw new Error('Position must be a whole number from 0 to 9,999.');
    if (imageUrl && (!safeImageUrl(imageUrl) || imageUrl.length > 2048))
        throw new Error('Use a valid HTTPS image URL.');
    if (trailerUrl && !youtubeId(trailerUrl))
        throw new Error('Use a valid HTTPS YouTube trailer link.');
    return {
        title,
        type: input.type,
        tier: input.tier,
        note,
        genre,
        year,
        rank,
        imageUrl: safeImageUrl(imageUrl),
        trailerUrl: trailerUrl
            ? `https://www.youtube.com/watch?v=${youtubeId(trailerUrl)}`
            : '',
    };
}

export function filterRecommendations(
    items,
    { type = 'all', search = '' } = {},
) {
    const term = search.trim().toLocaleLowerCase();
    return items
        .filter(
            (item) =>
                (type === 'all' || item.type === type) &&
                [item.title, item.genre, item.year]
                    .join(' ')
                    .toLocaleLowerCase()
                    .includes(term),
        )
        .sort(
            (a, b) =>
                a.rank - b.rank ||
                a.title.localeCompare(b.title) ||
                a.id.localeCompare(b.id),
        );
}
