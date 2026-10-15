export const validate = {
  //? Hyphenated Korean numbers: area or carrier prefix of 2-4 digits (02, 010, 0505), then 3-4, then 4 digits.
  phone: (phone: string) => /^\d{2,4}-\d{3,4}-\d{4}$/.test(phone),
  email: (email: string | null | undefined) => !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
};
