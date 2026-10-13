/** Webpack `?worker` imports (used for Monaco's local editor worker). */
declare module "*?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
