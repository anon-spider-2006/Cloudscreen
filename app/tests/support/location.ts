export const Accuracy = { Balanced: 3 };
export const requestForegroundPermissionsAsync = async () => ({ status: 'denied' });
export const getLastKnownPositionAsync = async () => null;
export const getCurrentPositionAsync = async () => { throw new Error('Location unavailable in Node tests'); };
export const reverseGeocodeAsync = async () => [];
