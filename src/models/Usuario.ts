import { Papel } from "../types";

export interface Usuario {
  id: string;
  username: string;
  hashSenha: string; // formato "salt:hash", nunca a senha em texto puro
  papel: Papel;
  criadoEm: string;
  ativo: boolean;
}
