// Metro handles CSS imports (global.css, *.module.css); TypeScript just needs to know they exist.
declare module '*.css';
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
