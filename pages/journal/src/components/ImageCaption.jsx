import { readImageCaptions } from '../utils/imageCaption';

export default function ImageCaption({ image, className = '' }) {
    const { caption, taggedCaptions } = readImageCaptions(image);
    if (!caption.trim() && !taggedCaptions.length) return null;

    return (
        <div data-image-caption className={`min-w-0 max-w-full space-y-3 text-center text-sm leading-relaxed [overflow-wrap:anywhere] ${className}`}>
            {caption.trim() && <p className="whitespace-pre-wrap italic">{caption}</p>}
            {taggedCaptions.map((item, index) => (
                <div key={index} data-tagged-caption>
                    <span className="mb-1 inline-block max-w-full rounded-full border border-current/20 bg-current/5 px-2.5 py-0.5 text-xs font-semibold not-italic" data-caption-tag>
                        {item.tag}
                    </span>
                    <p className="whitespace-pre-wrap font-medium">{item.caption}</p>
                </div>
            ))}
        </div>
    );
}
