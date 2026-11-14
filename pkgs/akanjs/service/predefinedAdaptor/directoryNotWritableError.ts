import { accessSync, constants, existsSync, statSync } from "node:fs";
import path from "node:path";
import { AkanError } from "akanjs/base";

export class DirectoryNotWritableError extends AkanError<"directoryNotWritable"> {
  constructor(dir: string, owner: number, uid: number, gid: number) {
    const fix = owner === uid ? `chmod u+rwx ${dir}` : `chown -R ${uid}:${gid} ${dir}`;
    super(
      "directoryNotWritable",
      `The server runs as uid ${uid} and cannot write ${dir}, which uid ${owner} owns. Run \`${fix}\` once as root on the volume that holds it (Docker: \`docker run --rm -u 0 --volumes-from <container> <image> ${fix}\`; Compose: \`docker compose run --rm -u 0 <service> ${fix}\`), or keep \`volumePermissions.enabled\` on in the infra/app Helm chart.`,
    );
  }

  //? A volume an image running as root wrote keeps root as its owner, so a non-root server would fail on its first write.
  static assert(dir: string) {
    const uid = process.getuid?.();
    if (uid === undefined) return;
    let target = path.resolve(dir);
    while (!existsSync(target) && path.dirname(target) !== target) target = path.dirname(target);
    try {
      accessSync(target, constants.W_OK | constants.X_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EACCES") return;
      throw new DirectoryNotWritableError(target, statSync(target).uid, uid, process.getgid?.() ?? uid);
    }
  }

  static assertFileDir(filePath: string) {
    if (filePath && filePath !== ":memory:") DirectoryNotWritableError.assert(path.dirname(path.resolve(filePath)));
  }
}
