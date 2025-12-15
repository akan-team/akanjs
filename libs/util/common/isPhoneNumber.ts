export const isPhoneNumber = (phone?: string | null) => {
  if (!phone) return false;
  const comp = phone.startsWith("0") ? phone.slice(1) : phone;
  const regExp1 = /^\(?([0-9]{2})\)?[-. ]?([0-9]{4})[-. ]?([0-9]{4})$/;
  const regExp2 = /^\(?([0-9]{2})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
  return (regExp1.test(comp) || regExp2.test(comp)) && phone.split("-").length === 3;
};
