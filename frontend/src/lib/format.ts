export const fr = (n: number, d = 0): string => n.toFixed(d).replace('.', ',');

export const telecharger = (nom: string, contenu: string, type = 'application/json'): void => {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
};
