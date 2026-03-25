import Color from "https://colorjs.io/dist/color.js";

// Ensure angles wrap strictly to 0-360
function wrapHue(hue) {
    return ((hue % 360) + 360) % 360;
}

/**
 * Generates an array of harmonized colors mathematically in OKLCH
 */
export function generateHarmonies(l, c, h, harmonyType) {
    let offsets = [];
    switch(harmonyType) {
        case 'complementary': offsets = [0, 180]; break;
        case 'split-complementary': offsets = [0, 150, 210]; break;
        case 'triadic': offsets = [0, 120, 240]; break;
        case 'analogous': offsets = [0, 30, -30]; break;
        default: offsets = [0];
    }
    
    return offsets.map(offset => {
        let newH = wrapHue(h + offset);
        // Using string init for Colorjs is reliable
        return new Color(`oklch(${l} ${c} ${newH})`);
    });
}

/**
 * Uses deviation from average Lightness & Chroma to identify Focal Accent Color
 */
export function identifyFocalColor(colors) {
    if(colors.length <= 1) return 0;
    
    let sumL = 0, sumC = 0;
    colors.forEach(col => { 
        sumL += col.coords[0]; // L
        sumC += col.coords[1]; // C
    });
    
    let avgL = sumL / colors.length;
    let avgC = sumC / colors.length;
    
    let maxDev = -1;
    let focalIdx = 0;
    
    colors.forEach((col, idx) => {
        let devL = Math.abs(col.coords[0] - avgL);
        let devC = Math.abs(col.coords[1] - avgC);
        // Weight chroma highly for focal attention in art
        let score = devL * 1.5 + devC * 3.5; 
        
        if (score > maxDev) {
            maxDev = score;
            focalIdx = idx;
        }
    });

    // Fallback if deviation isn't significant (e.g. grayscale)
    if (focalIdx === 0 && colors.length > 2) {
        focalIdx = colors.length - 1; // Assign to an end color
    }
    return focalIdx;
}

/**
 * Creates the final proportion objects factoring in harmony, properties, and apca
 */
export function arrangePalette(colors, ruleType) {
    let proportions = [];
    if (ruleType === '60-30-10') {
        proportions = [60, 30, 10];
    } else if (ruleType === '70-20-10') {
        proportions = [70, 20, 10];
    } else if (ruleType === 'golden') {
        // Golden ratio approximate distribution for 3 segments
        proportions = [61.8, 23.6, 14.6];
    }

    // Adaptive sizing for N colors
    if(colors.length < proportions.length) {
       proportions = proportions.slice(0, colors.length);
       let sum = proportions.reduce((a,b)=>a+b, 0);
       proportions = proportions.map(p => (p/sum)*100);
    } else if (colors.length > proportions.length) {
       let remaining = 100 - proportions.reduce((a,b)=>a+b, 0);
       let extra = colors.length - proportions.length;
       for(let i=0; i<extra; i++) proportions.push(remaining / extra);
    }

    const focalIdx = identifyFocalColor(colors);
    const sortedProps = [...proportions].sort((a,b)=>b-a);
    const mappedProps = new Array(colors.length).fill(0);
    
    const assigned = new Set();
    
    // Core Rules: Focal point gets smallest proportion. Base gets largest.
    if (focalIdx !== 0 && colors.length >= 2) {
        mappedProps[focalIdx] = sortedProps[sortedProps.length - 1];
        assigned.add(focalIdx);
        
        mappedProps[0] = sortedProps[0];
        assigned.add(0);
    } else {
        mappedProps[0] = sortedProps[0];
        assigned.add(0);
    }

    let propIdx = 1; 
    for(let i=0; i<colors.length; i++) {
        if (!assigned.has(i)) {
            while(mappedProps.includes(sortedProps[propIdx]) && propIdx < sortedProps.length) {
                propIdx++;
            }
            if (propIdx < sortedProps.length) {
                mappedProps[i] = sortedProps[propIdx];
                propIdx++;
            } else {
                mappedProps[i] = sortedProps[sortedProps.length-1];
            }
        }
    }

    // APCA contrast against a typical default background (white #ffffff)
    // APCA Lc rating range generally from 0 to 106. >60 is decent, >75 good formatting, >90 body text
    const bgColor = new Color("white");

    return colors.map((col, i) => {
        let apca = Math.abs(col.contrast(bgColor, "APCA"));
        return {
            colorObj: col,
            css: col.toString({ format: "oklch" }),
            hex: col.to("srgb").toString({ format: "hex" }),
            proportion: mappedProps[i],
            isFocal: i === focalIdx,
            contrastRatio: apca,
            l: col.coords[0]
        };
    });
}
