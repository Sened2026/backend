import { InvoiceStatus } from '../invoice/dto/invoice.dto';

/**
 * Labels FR pour les statuts Chorus Pro courants
 */
export const CHORUS_STATUS_LABELS: Record<string, string> = {
    DEPOSEE: 'Déposée',
    EN_COURS_ACHEMINEMENT: 'En cours d\'acheminement',
    MISE_A_DISPOSITION: 'Mise à disposition',
    SUSPENDUE: 'Suspendue',
    REJETEE: 'Rejetée',
    MANDATEE: 'Mandatée',
    MISE_EN_PAIEMENT: 'Mise en paiement',
    COMPTABILISEE: 'Comptabilisée',
    SERVICE_FAIT: 'Service fait',
    A_RECYCLER: 'À recycler',
    COMPLETEE: 'Complétée',
    VALIDEE: 'Validée',
    EN_COURS_TRAITEMENT: 'En cours de traitement',
    ERREUR: 'Erreur',
    ANNULEE: 'Annulée',
};

/**
 * Retourne le label FR d'un statut Chorus Pro, ou le statut brut si inconnu
 */
export function getChorusStatusLabel(chorusStatus: string): string {
    return CHORUS_STATUS_LABELS[chorusStatus] || chorusStatus;
}

/**
 * Détermine si un statut Chorus Pro doit synchroniser le statut interne de la facture.
 * Retourne le statut interne cible, ou null si pas de sync nécessaire.
 */
export function shouldSyncToInternalStatus(chorusStatus: string): InvoiceStatus | null {
    switch (chorusStatus) {
        case 'REJETEE':
        case 'A_RECYCLER':
            return InvoiceStatus.CANCELLED;
        case 'SUSPENDUE':
            return InvoiceStatus.SENT;
        case 'MANDATEE':
        case 'MISE_EN_PAIEMENT':
            return InvoiceStatus.PAID;
        default:
            return null;
    }
}

export type ChorusStatusCategory = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * Retourne la catégorie de couleur pour un statut Chorus Pro
 */
export function getChorusStatusCategory(chorusStatus: string): ChorusStatusCategory {
    switch (chorusStatus) {
        case 'MISE_A_DISPOSITION':
        case 'COMPLETEE':
        case 'VALIDEE':
        case 'MANDATEE':
        case 'MISE_EN_PAIEMENT':
        case 'SERVICE_FAIT':
        case 'COMPTABILISEE':
            return 'success';
        case 'SUSPENDUE':
            return 'warning';
        case 'REJETEE':
        case 'A_RECYCLER':
        case 'ERREUR':
            return 'error';
        case 'ANNULEE':
            return 'neutral';
        default:
            return 'info';
    }
}
