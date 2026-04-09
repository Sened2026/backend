-- ============================================
-- SEED DATA - Mock data pour tests Dashboard
-- ============================================
-- À exécuter dans Supabase SQL Editor
-- ============================================

DO $$
DECLARE
    v_user_id UUID;
    v_company_id UUID;
    v_client_ids UUID[] := '{}';
    v_product_ids UUID[] := '{}';
    v_quote_ids UUID[] := '{}';
    v_invoice_ids UUID[] := '{}';
    v_i INTEGER;
    v_quote_number INTEGER := 1;
    v_invoice_number INTEGER := 1;
    v_credit_note_number INTEGER := 1;
    v_start_date DATE;
    v_issue_date DATE;
    v_due_date DATE;
    v_status TEXT;
    v_subtotal DECIMAL(12,2);
    v_vat DECIMAL(12,2);
    v_total DECIMAL(12,2);
    v_amount_paid DECIMAL(12,2);
    v_quote_id UUID;
    v_invoice_id UUID;
    v_rand INTEGER;
BEGIN
    SELECT id INTO v_user_id FROM profiles LIMIT 1;
    SELECT c.id INTO v_company_id 
    FROM companies c
    JOIN user_companies uc ON c.id = uc.company_id
    WHERE uc.user_id = v_user_id AND uc.is_default = true
    LIMIT 1;
    
    IF v_user_id IS NULL OR v_company_id IS NULL THEN
        RAISE NOTICE 'Aucun utilisateur ou entreprise trouvé.';
        RETURN;
    END IF;
    
    RAISE NOTICE 'User ID: %', v_user_id;
    RAISE NOTICE 'Company ID: %', v_company_id;
    
    -- ============================================
    -- 1. CRÉER DES CLIENTS (10 clients mixtes)
    -- ============================================
    
    INSERT INTO clients (company_id, type, company_name, siret, email, phone, address, city, postal_code, country)
    VALUES 
        (v_company_id, 'professional', 'Tech Solutions SARL', '12345678900011', 'contact@techsolutions.fr', '01 23 45 67 89', '15 rue de la Tech', 'Paris', '75001', 'FR'),
        (v_company_id, 'professional', 'Digital Agency', '23456789000022', 'hello@digitalagency.fr', '01 34 56 78 90', '42 avenue du Digital', 'Lyon', '69001', 'FR'),
        (v_company_id, 'professional', 'Consulting Plus', '34567890100033', 'info@consultingplus.fr', '01 45 67 89 01', '8 boulevard du Conseil', 'Marseille', '13001', 'FR'),
        (v_company_id, 'professional', 'Startup Innovation', '45678901200044', 'team@startupinnov.fr', '01 56 78 90 12', '25 rue des Startups', 'Bordeaux', '33000', 'FR'),
        (v_company_id, 'professional', 'Commerce Moderne', '56789012300055', 'vente@commercemoderne.fr', '01 67 89 01 23', '100 rue du Commerce', 'Toulouse', '31000', 'FR'),
        (v_company_id, 'professional', 'Industrie Pro', '67890123400066', 'contact@industriepro.fr', '01 78 90 12 34', '50 zone industrielle', 'Nantes', '44000', 'FR');
    
    INSERT INTO clients (company_id, type, first_name, last_name, email, phone, address, city, postal_code, country)
    VALUES 
        (v_company_id, 'individual', 'Jean', 'Dupont', 'jean.dupont@email.fr', '06 12 34 56 78', '10 rue des Particuliers', 'Nice', '06000', 'FR'),
        (v_company_id, 'individual', 'Marie', 'Martin', 'marie.martin@email.fr', '06 23 45 67 89', '25 avenue de la Plage', 'Cannes', '06400', 'FR'),
        (v_company_id, 'individual', 'Pierre', 'Bernard', 'pierre.bernard@email.fr', '06 34 56 78 90', '5 chemin des Vignes', 'Montpellier', '34000', 'FR'),
        (v_company_id, 'individual', 'Sophie', 'Petit', 'sophie.petit@email.fr', '06 45 67 89 01', '30 rue du Centre', 'Strasbourg', '67000', 'FR');
    
    SELECT array_agg(id) INTO v_client_ids FROM clients WHERE company_id = v_company_id;
    RAISE NOTICE 'Clients créés: %', array_length(v_client_ids, 1);
    
    -- ============================================
    -- 2. CRÉER DES PRODUITS/SERVICES
    -- ============================================
    
    INSERT INTO products (company_id, name, description, unit_price, vat_rate, is_active)
    VALUES 
        (v_company_id, 'Consultation stratégique', 'Audit et conseil stratégique', 500.00, 20.00, true),
        (v_company_id, 'Développement web', 'Développement site web sur mesure', 150.00, 20.00, true),
        (v_company_id, 'Design UI/UX', 'Conception interface utilisateur', 120.00, 20.00, true),
        (v_company_id, 'Formation', 'Formation professionnelle', 350.00, 20.00, true),
        (v_company_id, 'Maintenance mensuelle', 'Contrat de maintenance', 250.00, 20.00, true),
        (v_company_id, 'Hébergement annuel', 'Service d''hébergement web', 99.00, 20.00, true),
        (v_company_id, 'Audit SEO', 'Audit référencement naturel', 450.00, 20.00, true),
        (v_company_id, 'Support technique', 'Assistance technique', 75.00, 20.00, true);
    
    SELECT array_agg(id) INTO v_product_ids FROM products WHERE company_id = v_company_id;
    RAISE NOTICE 'Produits créés: %', array_length(v_product_ids, 1);
    
    -- ============================================
    -- 3. CRÉER DES DEVIS (15 devis sur 12 mois)
    -- ============================================
    
    v_start_date := CURRENT_DATE - INTERVAL '12 months';
    
    FOR v_i IN 1..15 LOOP
        v_issue_date := v_start_date + (RANDOM() * 365)::INTEGER;
        v_due_date := v_issue_date + 30;
        v_rand := (RANDOM() * 100)::INTEGER;
        
        IF v_rand < 20 THEN
            v_status := 'draft';
        ELSIF v_rand < 40 THEN
            v_status := 'sent';
        ELSIF v_rand < 70 THEN
            v_status := 'accepted';
        ELSIF v_rand < 85 THEN
            v_status := 'converted';
        ELSE
            v_status := 'refused';
        END IF;
        
        v_subtotal := (RANDOM() * 5000 + 500)::DECIMAL(12,2);
        v_vat := ROUND(v_subtotal * 0.20, 2);
        v_total := v_subtotal + v_vat;
        
        INSERT INTO quotes (
            company_id, client_id, created_by, quote_number, status,
            title, issue_date, validity_date, subtotal, total_vat, total
        ) VALUES (
            v_company_id,
            v_client_ids[(RANDOM() * array_length(v_client_ids, 1) + 0.5)::INTEGER],
            v_user_id,
            'DEV-2025-' || LPAD(v_quote_number::TEXT, 4, '0'),
            v_status::quote_status,
            'Prestation de services',
            v_issue_date,
            v_due_date,
            v_subtotal,
            v_vat,
            v_total
        ) RETURNING id INTO v_quote_id;
        
        v_quote_ids := array_append(v_quote_ids, v_quote_id);
        v_quote_number := v_quote_number + 1;
        
        INSERT INTO quote_items (quote_id, position, description, quantity, unit_price, vat_rate, line_total)
        VALUES 
            (v_quote_id, 1, 'Prestation principale', 
             (RANDOM() * 10 + 1)::DECIMAL(12,2),
             (RANDOM() * 200 + 50)::DECIMAL(12,2),
             20.00,
             v_subtotal * 0.7),
            (v_quote_id, 2, 'Prestation complémentaire',
             (RANDOM() * 5 + 1)::DECIMAL(12,2),
             (RANDOM() * 100 + 30)::DECIMAL(12,2),
             20.00,
             v_subtotal * 0.3);
    END LOOP;
    
    RAISE NOTICE 'Devis créés: %', array_length(v_quote_ids, 1);
    
    -- ============================================
    -- 4. CRÉER DES FACTURES (25 factures sur 12 mois)
    -- ============================================
    
    FOR v_i IN 1..25 LOOP
        v_issue_date := v_start_date + (RANDOM() * 365)::INTEGER;
        v_due_date := v_issue_date + (RANDOM() * 30 + 15)::INTEGER;
        v_rand := (RANDOM() * 100)::INTEGER;
        
        IF v_rand < 10 THEN
            v_status := 'draft';
        ELSIF v_rand < 35 THEN
            IF v_due_date < CURRENT_DATE THEN
                v_status := 'overdue';
            ELSE
                v_status := 'sent';
            END IF;
        ELSIF v_rand < 70 THEN
            v_status := 'paid';
        ELSIF v_rand < 90 THEN
            v_status := 'partial';
        ELSE
            v_status := 'sent';
        END IF;
        
        v_subtotal := (RANDOM() * 8000 + 500)::DECIMAL(12,2);
        v_vat := ROUND(v_subtotal * 0.20, 2);
        v_total := v_subtotal + v_vat;
        
        IF v_status = 'paid' THEN
            v_amount_paid := v_total;
        ELSIF v_status = 'partial' THEN
            v_amount_paid := v_total * (RANDOM() * 0.5 + 0.2);
        ELSE
            v_amount_paid := 0;
        END IF;
        
        INSERT INTO invoices (
            company_id, client_id, created_by, invoice_number, status,
            title, issue_date, due_date, subtotal, total_vat, total, amount_paid
        ) VALUES (
            v_company_id,
            v_client_ids[(RANDOM() * array_length(v_client_ids, 1) + 0.5)::INTEGER],
            v_user_id,
            'FAC-2025-' || LPAD(v_invoice_number::TEXT, 4, '0'),
            v_status::invoice_status,
            'Facture de prestation',
            v_issue_date,
            v_due_date,
            v_subtotal,
            v_vat,
            v_total,
            v_amount_paid
        ) RETURNING id INTO v_invoice_id;
        
        v_invoice_ids := array_append(v_invoice_ids, v_invoice_id);
        v_invoice_number := v_invoice_number + 1;
        
        INSERT INTO invoice_items (invoice_id, position, description, quantity, unit_price, vat_rate, line_total)
        VALUES 
            (v_invoice_id, 1, 'Prestation principale',
             (RANDOM() * 10 + 1)::DECIMAL(12,2),
             (RANDOM() * 300 + 50)::DECIMAL(12,2),
             20.00,
             v_subtotal * 0.6),
            (v_invoice_id, 2, 'Prestation secondaire',
             (RANDOM() * 5 + 1)::DECIMAL(12,2),
             (RANDOM() * 150 + 30)::DECIMAL(12,2),
             20.00,
             v_subtotal * 0.4);
    END LOOP;
    
    RAISE NOTICE 'Factures créées: %', array_length(v_invoice_ids, 1);
    
    -- ============================================
    -- 5. CRÉER DES PAIEMENTS
    -- ============================================
    
    INSERT INTO payments (invoice_id, amount, payment_method, paid_at)
    SELECT 
        id,
        amount_paid,
        CASE (RANDOM() * 3)::INTEGER
            WHEN 0 THEN 'stripe'::payment_method
            WHEN 1 THEN 'bank_transfer'::payment_method
            ELSE 'check'::payment_method
        END,
        issue_date + (RANDOM() * 30)::INTEGER
    FROM invoices 
    WHERE company_id = v_company_id 
    AND status IN ('paid', 'partial')
    AND amount_paid > 0;
    
    RAISE NOTICE 'Paiements créés';
    
    -- ============================================
    -- 6. CRÉER DES AVOIRS (3 avoirs)
    -- ============================================
    
    FOR v_i IN 1..3 LOOP
        v_issue_date := CURRENT_DATE - (RANDOM() * 180)::INTEGER;
        v_subtotal := (RANDOM() * 1000 + 200)::DECIMAL(12,2);
        v_vat := ROUND(v_subtotal * 0.20, 2);
        v_total := v_subtotal + v_vat;
        
        INSERT INTO invoices (
            company_id, client_id, created_by, invoice_number, status,
            title, issue_date, due_date, subtotal, total_vat, total, type
        ) VALUES (
            v_company_id,
            v_client_ids[(RANDOM() * array_length(v_client_ids, 1) + 0.5)::INTEGER],
            v_user_id,
            'AVO-2025-' || LPAD(v_credit_note_number::TEXT, 4, '0'),
            'paid',
            'Avoir pour retour',
            v_issue_date,
            v_issue_date,
            -v_subtotal,
            -v_vat,
            -v_total,
            'credit_note'
        );
        
        v_credit_note_number := v_credit_note_number + 1;
    END LOOP;
    
    RAISE NOTICE 'Avoirs créés: 3';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SEED TERMINÉ AVEC SUCCÈS!';
    RAISE NOTICE '========================================';
    
END $$;
