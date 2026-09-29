import { Validador } from "./Validador";
import { validarCNPJ, normalizarCNPJ } from "../utils/cnpj";
import { Organizacao } from "../models/Organizacao";

export interface EntradaValidacaoOrganizacao {
  organizacao: Pick<Organizacao, "id" | "razaoSocial">;
  organizacoesExistentes: Organizacao[];
}

export class ValidadorOrganizacao extends Validador<EntradaValidacaoOrganizacao> {
  protected executar({ organizacao, organizacoesExistentes }: EntradaValidacaoOrganizacao): void {
    if (!organizacao.razaoSocial || organizacao.razaoSocial.trim().length < 2) {
      this.adicionarErro("Razao social e obrigatoria e deve ter ao menos 2 caracteres.");
    }

    if (!validarCNPJ(organizacao.id)) {
      this.adicionarErro("CNPJ invalido: os digitos verificadores nao conferem.");
      return; // sem CNPJ valido nao faz sentido checar unicidade
    }

    const cnpjNormalizado = normalizarCNPJ(organizacao.id);
    const jaExiste = organizacoesExistentes.some((o) => normalizarCNPJ(o.id) === cnpjNormalizado);
    if (jaExiste) {
      this.adicionarErro(`Ja existe uma organizacao cadastrada com o CNPJ ${cnpjNormalizado}.`);
    }
  }
}
