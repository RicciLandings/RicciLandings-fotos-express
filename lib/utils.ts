import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...clases: ClassValue[]) {
  return twMerge(clsx(clases));
}

const formatos = {
  ARS: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }),
  USD: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }),
};

export function formatearMonto(monto: number, moneda: 'ARS' | 'USD' = 'ARS'): string {
  return formatos[moneda].format(Number(monto));
}

export function formatearPesos(monto: number): string {
  return formatearMonto(monto, 'ARS');
}

export function formatearNumero(valor: number): string {
  return new Intl.NumberFormat('es-AR').format(Number(valor));
}
