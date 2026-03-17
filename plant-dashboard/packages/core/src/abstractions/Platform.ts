/** Platform detection — isWeb on web, updated by RN bootstrap */
export const Platform = {
  isWeb: true,
  isMobile: false,
  isIOS: false,
  isAndroid: false,
  OS: 'web' as 'web' | 'ios' | 'android',
  get screenWidth(): number {
    if (typeof window !== 'undefined') return window.innerWidth;
    return 375;
  },
  get screenHeight(): number {
    if (typeof window !== 'undefined') return window.innerHeight;
    return 812;
  },
  safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
  statusBarHeight: 0,
};
