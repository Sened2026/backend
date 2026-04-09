import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    cors: {
        origin: '*',
        credentials: true,
    },
    namespace: '/',
})
export class WebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private logger = new Logger('WebsocketGateway');
    private connectedClients: Map<string, { socket: Socket; companyId?: string; userId?: string }> = new Map();

    afterInit() {
        this.logger.log('WebSocket Gateway initialisé');
    }

    handleConnection(client: Socket) {
        this.logger.log(`Client connecté: ${client.id}`);
        this.connectedClients.set(client.id, { socket: client });
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client déconnecté: ${client.id}`);
        this.connectedClients.delete(client.id);
    }

    /**
     * Permet au client de rejoindre une room spécifique à son entreprise
     */
    @SubscribeMessage('joinCompany')
    handleJoinCompany(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { companyId: string; userId: string },
    ) {
        const { companyId, userId } = data;
        
        // Quitter les anciennes rooms
        const clientData = this.connectedClients.get(client.id);
        if (clientData?.companyId) {
            client.leave(`company:${clientData.companyId}`);
        }
        
        // Rejoindre la nouvelle room
        client.join(`company:${companyId}`);
        client.join(`user:${userId}`);
        
        // Mettre à jour les données du client
        this.connectedClients.set(client.id, { socket: client, companyId, userId });
        
        this.logger.log(`Client ${client.id} a rejoint company:${companyId}`);
        
        return { success: true, message: `Rejoint company:${companyId}` };
    }

    /**
     * Quitter une entreprise
     */
    @SubscribeMessage('leaveCompany')
    handleLeaveCompany(@ConnectedSocket() client: Socket) {
        const clientData = this.connectedClients.get(client.id);
        if (clientData?.companyId) {
            client.leave(`company:${clientData.companyId}`);
            this.connectedClients.set(client.id, { socket: client });
            this.logger.log(`Client ${client.id} a quitté company:${clientData.companyId}`);
        }
        return { success: true };
    }

    // ==================== MÉTHODES D'ÉMISSION ====================

    /**
     * Émet un événement à tous les clients d'une entreprise
     */
    emitToCompany(companyId: string, event: string, data: any) {
        this.server.to(`company:${companyId}`).emit(event, data);
        this.logger.debug(`Événement ${event} émis à company:${companyId}`);
    }

    /**
     * Émet un événement à un utilisateur spécifique
     */
    emitToUser(userId: string, event: string, data: any) {
        this.server.to(`user:${userId}`).emit(event, data);
        this.logger.debug(`Événement ${event} émis à user:${userId}`);
    }

    // ==================== ÉVÉNEMENTS CLIENTS ====================

    /**
     * Client créé
     */
    notifyClientCreated(companyId: string, client: any) {
        this.emitToCompany(companyId, 'client:created', client);
    }

    notifyClientUpdated(companyId: string, client: any) {
        this.emitToCompany(companyId, 'client:updated', client);
    }

    notifyClientDeleted(companyId: string, clientId: string) {
        this.emitToCompany(companyId, 'client:deleted', { id: clientId });
    }

    // ==================== ÉVÉNEMENTS FACTURES ====================

    notifyInvoiceCreated(companyId: string, invoice: any) {
        this.emitToCompany(companyId, 'invoice:created', invoice);
    }

    notifyInvoiceUpdated(companyId: string, invoice: any) {
        this.emitToCompany(companyId, 'invoice:updated', invoice);
    }

    notifyInvoiceDeleted(companyId: string, invoiceId: string) {
        this.emitToCompany(companyId, 'invoice:deleted', { id: invoiceId });
    }

    notifyInvoiceStatusChanged(companyId: string, invoice: any) {
        this.emitToCompany(companyId, 'invoice:status_changed', invoice);
    }

    // ==================== ÉVÉNEMENTS DEVIS ====================

    notifyQuoteCreated(companyId: string, quote: any) {
        this.emitToCompany(companyId, 'quote:created', quote);
    }

    notifyQuoteUpdated(companyId: string, quote: any) {
        this.emitToCompany(companyId, 'quote:updated', quote);
    }

    notifyQuoteDeleted(companyId: string, quoteId: string) {
        this.emitToCompany(companyId, 'quote:deleted', { id: quoteId });
    }

    notifyQuoteStatusChanged(companyId: string, quote: any) {
        this.emitToCompany(companyId, 'quote:status_changed', quote);
    }

    notifyQuoteSigned(companyId: string, quote: any) {
        this.emitToCompany(companyId, 'quote:signed', quote);
    }

    // ==================== ÉVÉNEMENTS PRODUITS ====================

    notifyProductCreated(companyId: string, product: any) {
        this.emitToCompany(companyId, 'product:created', product);
    }

    notifyProductUpdated(companyId: string, product: any) {
        this.emitToCompany(companyId, 'product:updated', product);
    }

    notifyProductDeleted(companyId: string, productId: string) {
        this.emitToCompany(companyId, 'product:deleted', { id: productId });
    }

    // ==================== ÉVÉNEMENTS PAIEMENTS ====================

    notifyPaymentCreated(companyId: string, payment: any) {
        this.emitToCompany(companyId, 'payment:created', payment);
    }

    notifyPaymentDeleted(companyId: string, paymentId: string) {
        this.emitToCompany(companyId, 'payment:deleted', { id: paymentId });
    }

    // ==================== ÉVÉNEMENTS CATÉGORIES ====================

    notifyCategoryCreated(companyId: string, category: any) {
        this.emitToCompany(companyId, 'category:created', category);
    }

    notifyCategoryUpdated(companyId: string, category: any) {
        this.emitToCompany(companyId, 'category:updated', category);
    }

    notifyCategoryDeleted(companyId: string, categoryId: string) {
        this.emitToCompany(companyId, 'category:deleted', { id: categoryId });
    }

    // ==================== ÉVÉNEMENTS ENTREPRISES ====================

    notifyCompanyCreated(userId: string, company: any) {
        this.emitToUser(userId, 'company:created', company);
    }

    notifyCompanyUpdated(companyId: string, company: any) {
        this.emitToCompany(companyId, 'company:updated', company);
    }

    notifyCompanyDeleted(userId: string, companyId: string) {
        this.emitToUser(userId, 'company:deleted', { id: companyId });
    }
}
