type Operator = "equals" | "lessThan" | "greaterThan";

export const deepEqual = <T>(a: T, b: T): boolean => {
    // Quick reference or primitive check
    if (a === b) return true;

    // If either is not an object or is null → not equal
    if (
        typeof a !== "object" ||
        typeof b !== "object" ||
        a === null ||
        b === null
    ) {
        return false;
    }

    // Arrays
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;

        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }

        return true;
    }

    // Objects
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
    }

    return true;
};

export const isTrue = (value1: unknown, operator: Operator, value2: unknown): boolean => {
    const normalize = (value: unknown): string | number | boolean => {
        if (typeof value === "boolean") return value;
        if (typeof value === "number") return value;

        if (typeof value === "string") {
            const lower = value.toLowerCase().trim();

            // Convert booleans
            if (lower === "true") return true;
            if (lower === "false") return false;

            // Convert numbers
            const num = Number(value);
            if (!isNaN(num)) return num;

            return value; // fallback string
        }

        return value as any;
    };

    const a = normalize(value1);
    const b = normalize(value2);

    switch (operator) {
        case "equals":
            return a === b;
        case "lessThan":
            return typeof a === "number" && typeof b === "number" && a < b;
        case "greaterThan":
            return typeof a === "number" && typeof b === "number" && a > b;
        default:
            return false;
    }
};
