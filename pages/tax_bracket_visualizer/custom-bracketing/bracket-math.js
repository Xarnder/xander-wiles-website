/**
 * Pure custom-bracket income maths.
 * Brackets are continuous ranges: income on a boundary belongs to the lower bracket.
 * The final bracket has to: null and runs upward with no limit.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (typeof root !== 'undefined') {
        root.CustomBrackets = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    let idCounter = 0;

    function nextId(prefix) {
        idCounter += 1;
        return prefix + '-' + idCounter.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function roundMoney(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    function roundRate(value) {
        return Math.round((value + Number.EPSILON) * 10000) / 10000;
    }

    function roundPercent(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    function cloneDeductions(deductions) {
        return (deductions || []).map(function (deduction) {
            return {
                id: deduction.id,
                name: deduction.name || '',
                rate: Number(deduction.rate) || 0
            };
        });
    }

    function cloneBrackets(brackets) {
        return (brackets || []).map(function (bracket) {
            return {
                id: bracket.id,
                from: bracket.from,
                to: bracket.to == null ? null : bracket.to,
                deductions: cloneDeductions(bracket.deductions)
            };
        });
    }

    function createDeduction(partial) {
        const source = partial || {};
        return {
            id: source.id || nextId('deduction'),
            name: source.name || '',
            rate: Number.isFinite(source.rate) ? source.rate : 0
        };
    }

    function createBracket(partial) {
        const source = partial || {};
        return {
            id: source.id || nextId('bracket'),
            from: Number.isFinite(source.from) ? source.from : 0,
            to: source.to == null ? null : source.to,
            deductions: cloneDeductions(source.deductions || [createDeduction()])
        };
    }

    function exampleConfig() {
        return {
            gross: 45000,
            brackets: [
                createBracket({
                    from: 0,
                    to: 12570,
                    deductions: [createDeduction({ name: 'Income Tax', rate: 0 })]
                }),
                createBracket({
                    from: 12570,
                    to: 29385,
                    deductions: [
                        createDeduction({ name: 'Income Tax', rate: 20 }),
                        createDeduction({ name: 'National Insurance', rate: 8 })
                    ]
                }),
                createBracket({
                    from: 29385,
                    to: 52280,
                    deductions: [
                        createDeduction({ name: 'Income Tax', rate: 20 }),
                        createDeduction({ name: 'National Insurance', rate: 8 }),
                        createDeduction({ name: 'Student Loan', rate: 9 })
                    ]
                }),
                createBracket({
                    from: 52280,
                    to: null,
                    deductions: [
                        createDeduction({ name: 'Income Tax', rate: 40 }),
                        createDeduction({ name: 'National Insurance', rate: 2 }),
                        createDeduction({ name: 'Student Loan', rate: 9 })
                    ]
                })
            ]
        };
    }

    function deductionRate(deductions) {
        return (deductions || []).reduce(function (sum, deduction) {
            const rate = Number(deduction && deduction.rate);
            return sum + (Number.isFinite(rate) ? rate : 0);
        }, 0);
    }

    function keepRate(deductions) {
        return roundRate(100 - deductionRate(deductions));
    }

    function deductionLabel(deduction, index) {
        const name = deduction && String(deduction.name || '').trim();
        return name || ('Deduction ' + (index + 1));
    }

    function calculateBracketAmount(income, bracket) {
        if (!Number.isFinite(income) || income <= 0 || !bracket) return 0;
        if (income <= bracket.from) return 0;
        const upper = bracket.to == null ? income : Math.min(income, bracket.to);
        return roundMoney(Math.max(0, upper - bracket.from));
    }

    function calculateBracketDeduction(income, bracket) {
        const amount = calculateBracketAmount(income, bracket);
        return amount * (deductionRate(bracket && bracket.deductions) / 100);
    }

    function calculateEffectiveRate(gross, totalDeducted) {
        if (!Number.isFinite(gross) || gross <= 0) return 0;
        return (totalDeducted / gross) * 100;
    }

    function incomeEquivalents(annualNet) {
        const annual = Number.isFinite(annualNet) ? annualNet : 0;
        return {
            annual: annual,
            monthly: annual / 12,
            weekly: annual / 52
        };
    }

    function validateBrackets(income, brackets) {
        const errors = [];
        if (!Number.isFinite(income)) errors.push('Enter a gross income.');
        else if (income < 0) errors.push('Gross income cannot be negative.');

        if (!Array.isArray(brackets) || brackets.length === 0) {
            errors.push('Add at least one income bracket.');
            return unique(errors);
        }

        if (brackets[0].from !== 0) errors.push('The first bracket has to start at £0.');

        brackets.forEach(function (bracket, index) {
            const last = index === brackets.length - 1;
            if (last) {
                if (bracket.to !== null) errors.push('The last bracket has to continue with no upper limit.');
            } else if (bracket.to == null || !Number.isFinite(bracket.to)) {
                errors.push('Each bracket needs an upper boundary except the last.');
            } else if (!(bracket.to > bracket.from)) {
                errors.push('Bracket boundaries have to increase.');
            }

            if (index > 0 && bracket.from !== brackets[index - 1].to) {
                errors.push('Brackets cannot overlap or leave a gap.');
            }

            let total = 0;
            (bracket.deductions || []).forEach(function (deduction) {
                if (!Number.isFinite(deduction.rate)) {
                    errors.push('Enter a percentage for each deduction.');
                } else if (deduction.rate < 0) {
                    errors.push('Percentages cannot be negative.');
                } else {
                    total += deduction.rate;
                }
            });
            if (total > 100 + 1e-9) errors.push('Total deductions in a bracket cannot exceed 100%.');
        });

        return unique(errors);
    }

    function unique(items) {
        return items.filter(function (item, index) {
            return items.indexOf(item) === index;
        });
    }

    function scaleDeductions(deductions, nextTotal) {
        const current = deductionRate(deductions);
        if (!deductions || deductions.length === 0) {
            return [createDeduction({ name: '', rate: roundRate(nextTotal) })];
        }
        if (current === 0) {
            return deductions.map(function (deduction, index) {
                return {
                    id: deduction.id,
                    name: deduction.name || '',
                    rate: index === 0 ? roundRate(nextTotal) : 0
                };
            });
        }

        const factor = nextTotal / current;
        const scaled = deductions.map(function (deduction) {
            return {
                id: deduction.id,
                name: deduction.name || '',
                rate: roundRate(deduction.rate * factor)
            };
        });
        const drift = roundRate(nextTotal - deductionRate(scaled));
        if (drift !== 0) {
            const last = scaled[scaled.length - 1];
            last.rate = roundRate(last.rate + drift);
        }
        return scaled;
    }

    function calculateCustomNetIncome(income, brackets) {
        const errors = validateBrackets(income, brackets);
        if (errors.length) {
            return {
                ok: false,
                errors: errors,
                gross: Number.isFinite(income) ? income : 0,
                totalDeducted: 0,
                net: 0,
                rows: [],
                effectiveRate: 0,
                keepRate: 0,
                equivalents: incomeEquivalents(0)
            };
        }

        const rows = brackets.map(function (bracket) {
            const slice = calculateBracketAmount(income, bracket);
            const rate = deductionRate(bracket.deductions);
            const deducted = roundMoney(slice * (rate / 100));
            const kept = roundMoney(slice - deducted);
            return {
                id: bracket.id,
                from: bracket.from,
                to: slice > 0 && (bracket.to == null || income < bracket.to) ? income : bracket.to,
                limit: bracket.to,
                slice: slice,
                rate: rate,
                deducted: deducted,
                kept: kept,
                parts: deductionParts(slice, bracket.deductions, deducted)
            };
        });

        const activeRows = rows.filter(function (row) { return row.slice > 0; });
        const totalDeducted = roundMoney(activeRows.reduce(function (sum, row) {
            return sum + row.deducted;
        }, 0));
        const net = roundMoney(income - totalDeducted);
        const effectiveRate = calculateEffectiveRate(income, totalDeducted);

        return {
            ok: true,
            errors: [],
            gross: income,
            totalDeducted: totalDeducted,
            net: net,
            rows: activeRows.length ? activeRows : rows.slice(0, 1),
            effectiveRate: effectiveRate,
            keepRate: income > 0 ? 100 - effectiveRate : 100,
            equivalents: incomeEquivalents(net)
        };
    }

    function bracketStructureErrors(brackets) {
        return validateBrackets(0, brackets).filter(function (message) {
            return message !== 'Enter a gross income.' && message !== 'Gross income cannot be negative.';
        });
    }

    function marginalSlice(start, end, bracket) {
        if (!(end > start) || !bracket) return 0;
        const lower = Math.max(start, bracket.from);
        const upper = bracket.to == null ? end : Math.min(end, bracket.to);
        if (!(upper > lower)) return 0;
        return roundMoney(upper - lower);
    }

    function deductionParts(slice, deductions, deducted) {
        const parts = (deductions || []).map(function (deduction, index) {
            return {
                id: deduction.id,
                name: deductionLabel(deduction, index),
                rate: deduction.rate,
                amount: roundMoney(slice * (Number(deduction.rate) / 100))
            };
        });
        const partSum = parts.reduce(function (sum, part) { return sum + part.amount; }, 0);
        const drift = roundMoney(deducted - partSum);
        if (parts.length && drift !== 0) {
            parts[parts.length - 1].amount = roundMoney(parts[parts.length - 1].amount + drift);
        }
        return parts;
    }

    function marginalRows(start, end, brackets) {
        const rows = [];
        brackets.forEach(function (bracket) {
            const lower = Math.max(start, bracket.from);
            const upper = bracket.to == null ? end : Math.min(end, bracket.to);
            const slice = marginalSlice(start, end, bracket);
            if (slice <= 0) return;
            const rate = deductionRate(bracket.deductions);
            const deducted = roundMoney(slice * (rate / 100));
            const kept = roundMoney(slice - deducted);
            rows.push({
                id: bracket.id,
                from: roundMoney(lower),
                to: roundMoney(upper),
                limit: bracket.to,
                slice: slice,
                rate: rate,
                deducted: deducted,
                kept: kept,
                parts: deductionParts(slice, bracket.deductions, deducted)
            });
        });
        return rows;
    }

    function reconcileMarginalRows(rows, additionalDeductions, additionalNet) {
        if (!rows.length) return rows;
        const deductedSum = roundMoney(rows.reduce(function (sum, row) { return sum + row.deducted; }, 0));
        const keptSum = roundMoney(rows.reduce(function (sum, row) { return sum + row.kept; }, 0));
        const last = rows[rows.length - 1];
        const deductedDrift = roundMoney(additionalDeductions - deductedSum);
        const keptDrift = roundMoney(additionalNet - keptSum);
        if (deductedDrift !== 0) {
            last.deducted = roundMoney(last.deducted + deductedDrift);
            if (last.parts.length) {
                const part = last.parts[last.parts.length - 1];
                part.amount = roundMoney(part.amount + deductedDrift);
            }
        }
        if (keptDrift !== 0) last.kept = roundMoney(last.kept + keptDrift);
        return rows;
    }

    function failedAdditional(currentIncome, additionalIncome, errors) {
        return {
            ok: false,
            errors: errors,
            currentIncome: Number.isFinite(currentIncome) ? currentIncome : 0,
            additionalGross: Number.isFinite(additionalIncome) ? additionalIncome : 0,
            additionalDeductions: 0,
            additionalNet: 0,
            effectiveDeductionRate: 0,
            keepRate: 0,
            finalGrossIncome: 0,
            breakdown: [],
            equivalents: incomeEquivalents(0)
        };
    }

    function calculateAdditionalNetIncome(currentIncome, additionalIncome, brackets) {
        const errors = [];
        if (!Number.isFinite(currentIncome)) errors.push('Enter the income you have already earned.');
        else if (currentIncome < 0) errors.push('Income already earned cannot be negative.');
        if (!Number.isFinite(additionalIncome)) errors.push('Enter the extra income.');
        else if (additionalIncome < 0) errors.push('Extra income cannot be negative.');
        bracketStructureErrors(brackets).forEach(function (message) {
            errors.push(message);
        });
        if (errors.length) return failedAdditional(currentIncome, additionalIncome, unique(errors));

        const current = roundMoney(currentIncome);
        const extra = roundMoney(additionalIncome);
        const finalIncome = roundMoney(current + extra);
        const before = calculateCustomNetIncome(current, brackets);
        const after = calculateCustomNetIncome(finalIncome, brackets);
        if (!before.ok || !after.ok) {
            return failedAdditional(current, extra, unique(before.errors.concat(after.errors)));
        }

        const additionalDeductions = roundMoney(after.totalDeducted - before.totalDeducted);
        const additionalNet = roundMoney(after.net - before.net);
        const preciseRate = calculateEffectiveRate(extra, additionalDeductions);
        const effectiveDeductionRate = extra > 0 ? roundPercent(preciseRate) : 0;

        return {
            ok: true,
            errors: [],
            currentIncome: current,
            additionalGross: extra,
            additionalDeductions: additionalDeductions,
            additionalNet: additionalNet,
            effectiveDeductionRate: effectiveDeductionRate,
            keepRate: extra > 0 ? roundPercent(100 - effectiveDeductionRate) : 100,
            finalGrossIncome: finalIncome,
            breakdown: reconcileMarginalRows(marginalRows(current, finalIncome, brackets), additionalDeductions, additionalNet),
            equivalents: incomeEquivalents(additionalNet)
        };
    }

    function failedDifference(currentIncome, newIncome, errors) {
        return {
            ok: false,
            errors: errors,
            direction: 'same',
            currentIncome: Number.isFinite(currentIncome) ? currentIncome : 0,
            newIncome: Number.isFinite(newIncome) ? newIncome : 0,
            currentNet: 0,
            newNet: 0,
            currentDeductions: 0,
            newDeductions: 0,
            grossDifference: 0,
            netDifference: 0,
            deductionsOnDifference: 0,
            effectiveCutOnIncrease: null,
            keepRateOnIncrease: null,
            breakdown: [],
            equivalents: incomeEquivalents(0)
        };
    }

    function calculateIncomeDifference(currentIncome, newIncome, brackets) {
        const errors = [];
        if (!Number.isFinite(currentIncome)) errors.push('Enter the current salary.');
        else if (currentIncome < 0) errors.push('Current salary cannot be negative.');
        if (!Number.isFinite(newIncome)) errors.push('Enter the new salary.');
        else if (newIncome < 0) errors.push('New salary cannot be negative.');
        bracketStructureErrors(brackets).forEach(function (message) {
            errors.push(message);
        });
        if (errors.length) return failedDifference(currentIncome, newIncome, unique(errors));

        const current = roundMoney(currentIncome);
        const next = roundMoney(newIncome);
        const before = calculateCustomNetIncome(current, brackets);
        const after = calculateCustomNetIncome(next, brackets);
        if (!before.ok || !after.ok) {
            return failedDifference(current, next, unique(before.errors.concat(after.errors)));
        }

        const grossDifference = roundMoney(next - current);
        const netDifference = roundMoney(after.net - before.net);
        const deductionsOnDifference = roundMoney(grossDifference - netDifference);
        const direction = grossDifference > 0 ? 'increase' : (grossDifference < 0 ? 'decrease' : 'same');
        const lower = Math.min(current, next);
        const higher = Math.max(current, next);
        let breakdown = [];
        let effectiveCutOnIncrease = null;
        let keepRateOnIncrease = null;

        if (higher > lower) {
            const span = calculateAdditionalNetIncome(lower, roundMoney(higher - lower), brackets);
            if (!span.ok) return failedDifference(current, next, span.errors);
            breakdown = reconcileMarginalRows(
                span.breakdown,
                Math.abs(deductionsOnDifference),
                Math.abs(netDifference)
            );
            if (direction === 'increase') {
                effectiveCutOnIncrease = span.effectiveDeductionRate;
                keepRateOnIncrease = span.keepRate;
            }
        }

        return {
            ok: true,
            errors: [],
            direction: direction,
            currentIncome: current,
            newIncome: next,
            currentNet: before.net,
            newNet: after.net,
            currentDeductions: before.totalDeducted,
            newDeductions: after.totalDeducted,
            grossDifference: grossDifference,
            netDifference: netDifference,
            deductionsOnDifference: deductionsOnDifference,
            effectiveCutOnIncrease: effectiveCutOnIncrease,
            keepRateOnIncrease: keepRateOnIncrease,
            breakdown: breakdown,
            equivalents: incomeEquivalents(netDifference)
        };
    }

    function suggestBoundary(brackets) {
        const last = brackets[brackets.length - 1];
        const floor = last ? last.from : 0;
        let at = floor === 0 ? 10000 : Math.round(floor * 1.5);
        const taken = {};
        brackets.forEach(function (bracket) {
            if (bracket.to != null) taken[bracket.to] = true;
        });
        while (at <= floor || taken[at]) at += 1000;
        return at;
    }

    function addBoundary(brackets, value) {
        const next = cloneBrackets(brackets);
        if (!next.length) {
            next.push(createBracket({ from: 0, to: null, deductions: [createDeduction()] }));
        }
        const at = Number.isFinite(value) ? value : suggestBoundary(next);
        const index = next.findIndex(function (bracket) {
            return at > bracket.from && (bracket.to == null || at < bracket.to);
        });
        if (index === -1) {
            return { ok: false, error: 'That boundary overlaps an existing one.', brackets: next };
        }
        const current = next[index];
        next.splice(index + 1, 0, createBracket({
            from: at,
            to: current.to,
            deductions: cloneDeductions(current.deductions)
        }));
        current.to = at;
        return { ok: true, brackets: next };
    }

    function removeBracket(brackets, index) {
        if (!Array.isArray(brackets) || brackets.length < 2) {
            return { ok: false, error: 'Keep at least one bracket.', brackets: cloneBrackets(brackets) };
        }
        if (index < 0 || index >= brackets.length) {
            return { ok: false, error: 'That bracket is not in the list.', brackets: cloneBrackets(brackets) };
        }
        const next = cloneBrackets(brackets);
        if (index === 0) {
            next[1].from = 0;
            next.shift();
        } else if (index === next.length - 1) {
            next[index - 1].to = null;
            next.pop();
        } else {
            next[index - 1].to = next[index].to;
            next.splice(index, 1);
        }
        return { ok: true, brackets: next };
    }

    function addDeduction(brackets, bracketIndex) {
        const next = cloneBrackets(brackets);
        const bracket = next[bracketIndex];
        if (!bracket) return { ok: false, error: 'That bracket is not in the list.', brackets: next };
        bracket.deductions.push(createDeduction());
        return { ok: true, brackets: next };
    }

    function removeDeduction(brackets, bracketIndex, deductionId) {
        const next = cloneBrackets(brackets);
        const bracket = next[bracketIndex];
        if (!bracket) return { ok: false, error: 'That bracket is not in the list.', brackets: next };
        bracket.deductions = bracket.deductions.filter(function (deduction) {
            return deduction.id !== deductionId;
        });
        return { ok: true, brackets: next };
    }

    function setBracketEnd(brackets, index, value) {
        const next = cloneBrackets(brackets);
        if (index < 0 || index >= next.length - 1) {
            return { ok: false, error: 'The last bracket stays open-ended.', brackets: next };
        }
        if (!Number.isFinite(value)) {
            return { ok: false, error: 'Enter a boundary.', brackets: next };
        }
        if (!(value > next[index].from)) {
            return { ok: false, error: 'A boundary has to stay above the one before it.', brackets: next };
        }
        const nextLimit = next[index + 1].to;
        if (nextLimit != null && !(value < nextLimit)) {
            return { ok: false, error: 'A boundary cannot cross the next one.', brackets: next };
        }
        next[index].to = value;
        next[index + 1].from = value;
        return { ok: true, brackets: next };
    }

    function setBracketCut(brackets, index, cutPercent) {
        const next = cloneBrackets(brackets);
        const bracket = next[index];
        if (!bracket) return { ok: false, error: 'That bracket is not in the list.', brackets: next };
        if (!Number.isFinite(cutPercent)) return { ok: false, error: 'Enter a percentage.', brackets: next };
        if (cutPercent < 0) return { ok: false, error: 'Percentages cannot be negative.', brackets: next };
        if (cutPercent > 100) return { ok: false, error: 'Total deductions cannot exceed 100%.', brackets: next };
        bracket.deductions = scaleDeductions(bracket.deductions, cutPercent);
        return { ok: true, brackets: next };
    }

    function setBracketKeep(brackets, index, keepPercent) {
        if (!Number.isFinite(keepPercent)) {
            return { ok: false, error: 'Enter a percentage.', brackets: cloneBrackets(brackets) };
        }
        return setBracketCut(brackets, index, roundRate(100 - keepPercent));
    }

    function parseAmount(raw) {
        const cleaned = String(raw == null ? '' : raw).trim().toLowerCase().replace(/£/g, '').replace(/,/g, '').replace(/\s+/g, '');
        if (cleaned === '') return { empty: true };
        const match = cleaned.match(/^(\d+\.?\d*|\.\d+)([km])?$/);
        if (!match) return { invalid: true };
        let value = Number(match[1]);
        if (match[2] === 'k') value *= 1000;
        if (match[2] === 'm') value *= 1000000;
        if (!Number.isFinite(value)) return { invalid: true };
        return { value: value };
    }

    function parsePercent(raw) {
        const cleaned = String(raw == null ? '' : raw).trim().replace(/%/g, '').replace(/,/g, '');
        if (cleaned === '') return { empty: true };
        if (cleaned.startsWith('-')) return { invalid: true, negative: true };
        if (!/^(\d+\.?\d*|\.\d+)$/.test(cleaned)) return { invalid: true };
        const value = Number(cleaned);
        if (!Number.isFinite(value)) return { invalid: true };
        return { value: value };
    }

    return {
        exampleConfig: exampleConfig,
        cloneBrackets: cloneBrackets,
        createDeduction: createDeduction,
        createBracket: createBracket,
        deductionRate: deductionRate,
        keepRate: keepRate,
        deductionLabel: deductionLabel,
        calculateBracketAmount: calculateBracketAmount,
        calculateBracketDeduction: calculateBracketDeduction,
        calculateCustomNetIncome: calculateCustomNetIncome,
        calculateAdditionalNetIncome: calculateAdditionalNetIncome,
        calculateIncomeDifference: calculateIncomeDifference,
        calculateEffectiveRate: calculateEffectiveRate,
        incomeEquivalents: incomeEquivalents,
        validateBrackets: validateBrackets,
        addBoundary: addBoundary,
        removeBracket: removeBracket,
        addDeduction: addDeduction,
        removeDeduction: removeDeduction,
        setBracketEnd: setBracketEnd,
        setBracketCut: setBracketCut,
        setBracketKeep: setBracketKeep,
        parseAmount: parseAmount,
        parsePercent: parsePercent,
        roundMoney: roundMoney,
        roundRate: roundRate
    };
});
