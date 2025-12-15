export const isEmail = (email?: string | null) => !!email && /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,8})+$/.test(email);
