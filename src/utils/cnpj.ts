/**
 * Validacao de CNPJ conforme o algoritmo oficial de digitos verificadores
 * (modulo 11 com pesos especificos), usado pela legislacao brasileira.
 */

function somenteDigitos(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

function calcularDigito(base: number[], pesos: number[]): number {
  const soma = base.reduce((acc, digito, i) => acc + digito * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCNPJ(cnpjOriginal: string): boolean {
  const cnpj = somenteDigitos(cnpjOriginal);

  if (cnpj.length !== 14) return false;
  // CNPJs com todos os digitos iguais sao formalmente invalidos.
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digitos = cnpj.split("").map(Number);
  const base12 = digitos.slice(0, 12);

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const dv1 = calcularDigito(base12, pesos1);

  const base13 = [...base12, dv1];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const dv2 = calcularDigito(base13, pesos2);

  return digitos[12] === dv1 && digitos[13] === dv2;
}

export function formatarCNPJ(cnpjOriginal: string): string {
  const cnpj = somenteDigitos(cnpjOriginal);
  if (cnpj.length !== 14) return cnpjOriginal;
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export function normalizarCNPJ(cnpjOriginal: string): string {
  return somenteDigitos(cnpjOriginal);
}
