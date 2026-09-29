export interface Contrato {
  numero: string;
  vigenciaInicio: string;
  vigenciaFim: string;
}

export interface Organizacao {
  id: string; // CNPJ normalizado (somente digitos)
  razaoSocial: string;
  segmento: string; // ex: "varejo", "hospitalar", "educacional", "bancario"
  contrato: Contrato;
  criadoEm: string;
}
