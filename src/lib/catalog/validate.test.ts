import { describe, expect, it } from "vitest";
import { ApiError } from "../api-v2/errors";
import { parseProjectCreate, parseProjectPatch, parseSlug, parseVersionCreate } from "./validate";

const SHA1 = "a".repeat(40);
const SHA512 = "b".repeat(128);
const file = (over: Record<string, unknown> = {}) => ({ shareToken: "tok_abcdefgh", filename: "luna.jar", size: 1234, sha1: SHA1, sha512: SHA512, ...over });
const version = (over: Record<string, unknown> = {}) => ({ versionNumber: "1.0.0", name: "Première", gameVersions: ["1.21.1"], loaders: ["fabric"], files: [file()], ...over });
const project = (over: Record<string, unknown> = {}) => ({ slug: "luna-pack", projectType: "mod", title: "Luna", summary: "Un mod", ...over });

const fails = (fn: () => unknown, message?: RegExp) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    if (message) expect((e as ApiError).message).toMatch(message);
    return;
  }
  throw new Error("aurait dû être refusé");
};

describe("catalog slug", () => {
  it("accepte les slugs propres", () => {
    expect(parseSlug("luna-modpack")).toBe("luna-modpack");
    expect(parseSlug("a1")).toBe("a1");
  });
  it("refuse majuscules, tiret initial, chemins et longueur", () => {
    for (const bad of ["Luna", "-luna", "lu na", "../etc", "a", "x".repeat(65), "", 12]) fails(() => parseSlug(bad));
  });
});

describe("parseProjectCreate", () => {
  it("applique les valeurs par défaut", () => {
    expect(parseProjectCreate(project())).toEqual({
      slug: "luna-pack", projectType: "mod", title: "Luna", summary: "Un mod", description: "", categories: [], iconToken: null,
    });
  });
  it("refuse un champ inconnu (pas de mass-assignment)", () => {
    fails(() => parseProjectCreate(project({ ownerId: "x" })), /Champ inconnu/);
    fails(() => parseProjectCreate(project({ status: "published" })), /Champ inconnu/);
  });
  it("refuse un type inconnu, un titre vide et un résumé trop long", () => {
    fails(() => parseProjectCreate(project({ projectType: "exe" })));
    fails(() => parseProjectCreate(project({ title: "  " })));
    fails(() => parseProjectCreate(project({ summary: "x".repeat(201) })));
  });
  it("refuse les caractères de contrôle et d'inversion bidirectionnelle", () => {
    fails(() => parseProjectCreate(project({ title: "a‮b" })), /interdits/);
    fails(() => parseProjectCreate(project({ summary: "a\u0000b" })), /interdits/);
  });
  it("garde les retours à la ligne dans la description", () => {
    expect(parseProjectCreate(project({ description: "# Titre\n\ntexte" })).description).toBe("# Titre\n\ntexte");
  });
});

describe("parseProjectPatch", () => {
  it("ne permet pas de changer le slug ni le type", () => {
    fails(() => parseProjectPatch({ slug: "autre" }), /Champ inconnu/);
    fails(() => parseProjectPatch({ projectType: "modpack" }), /Champ inconnu/);
  });
  it("refuse un corps vide, accepte de retirer l'icône", () => {
    fails(() => parseProjectPatch({}));
    expect(parseProjectPatch({ iconToken: null })).toEqual({ iconToken: null });
  });
});

describe("parseVersionCreate", () => {
  it("accepte une version simple et marque son seul fichier comme principal", () => {
    const v = parseVersionCreate(version(), "mod");
    expect(v.channel).toBe("release");
    expect(v.files[0]!.isPrimary).toBe(true);
    expect(v.dependencies).toEqual([]);
  });
  it("n'accepte que l'extension qui va avec le type du projet", () => {
    fails(() => parseVersionCreate(version({ files: [file({ filename: "luna.exe" })] }), "mod"), /n'accepte que/);
    fails(() => parseVersionCreate(version({ files: [file({ filename: "luna.jar" })] }), "modpack"), /\.mrpack/);
    expect(parseVersionCreate(version({ files: [file({ filename: "pack.MRPACK" })] }), "modpack").files).toHaveLength(1);
    expect(parseVersionCreate(version({ files: [file({ filename: "p.zip" })] }), "shader").files).toHaveLength(1);
  });
  it("refuse un nom de fichier avec chemin", () => {
    fails(() => parseVersionCreate(version({ files: [file({ filename: "../luna.jar" })] }), "mod"));
  });
  it("exige exactement un fichier principal quand il y en a plusieurs", () => {
    const two = [file({ shareToken: "tok_aaaaaaaa" }), file({ shareToken: "tok_bbbbbbbb", filename: "b.jar" })];
    fails(() => parseVersionCreate(version({ files: two }), "mod"), /Exactement un/);
    fails(() => parseVersionCreate(version({ files: two.map((f) => ({ ...f, primary: true })) }), "mod"), /Exactement un/);
    expect(parseVersionCreate(version({ files: [{ ...two[0]!, primary: true }, two[1]!] }), "mod").files[0]!.isPrimary).toBe(true);
  });
  it("refuse le même lien deux fois", () => {
    fails(() => parseVersionCreate(version({ files: [file(), file({ filename: "b.jar" })] }), "mod"), /deux fois/);
  });
  it("vérifie les empreintes (casse, longueur) et la taille", () => {
    fails(() => parseVersionCreate(version({ files: [file({ sha1: "A".repeat(40) })] }), "mod"));
    fails(() => parseVersionCreate(version({ files: [file({ sha512: "b".repeat(127) })] }), "mod"));
    fails(() => parseVersionCreate(version({ files: [file({ size: 0 })] }), "mod"));
    fails(() => parseVersionCreate(version({ files: [file({ size: 1.5 })] }), "mod"));
    fails(() => parseVersionCreate(version({ files: [file({ size: "12" })] }), "mod"));
  });
  it("exige au moins une version de jeu et un loader", () => {
    fails(() => parseVersionCreate(version({ gameVersions: [] }), "mod"));
    fails(() => parseVersionCreate(version({ loaders: [] }), "mod"));
    fails(() => parseVersionCreate(version({ loaders: ["Fabric!"] }), "mod"));
  });
  it("valide les dépendances", () => {
    const dep = { projectId: "fabric-api", source: "modrinth", type: "required" };
    expect(parseVersionCreate(version({ dependencies: [dep] }), "mod").dependencies).toEqual([dep]);
    fails(() => parseVersionCreate(version({ dependencies: [{ ...dep, source: "ailleurs" }] }), "mod"));
    fails(() => parseVersionCreate(version({ dependencies: [{ ...dep, extra: 1 }] }), "mod"), /Champ inconnu/);
    fails(() => parseVersionCreate(version({ dependencies: Array(51).fill(dep) }), "mod"));
  });
  it("refuse un canal ou un numéro de version invalide", () => {
    fails(() => parseVersionCreate(version({ channel: "nightly" }), "mod"));
    fails(() => parseVersionCreate(version({ versionNumber: "../1" }), "mod"));
  });
});
