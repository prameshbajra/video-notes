export const generateShareId = (): string => {
    return crypto.randomUUID().replace(/-/g, '');
};
