// QR Services - CRUD cho QR Master Data và Products + EMV Encode/Decode
import { database } from './firebase';
import { ref, push, set, get, update, remove, query, orderByChild, equalTo } from 'firebase/database';
import { QRMasterData, QRProduct, QRGenerateRequest, EMVQRField, ParsedEMVQR } from '../../types';

// ================================
// QR MASTER DATA SERVICE
// ================================

export const QRMasterService = {
    async addMaster(data: Omit<QRMasterData, 'id' | 'createdAt'>): Promise<string> {
        const masterRef = ref(database, 'qr_masters');
        const newRef = push(masterRef);
        const master: QRMasterData = {
            ...data,
            id: newRef.key!,
            createdAt: new Date().toISOString(),
        };
        await set(newRef, master);
        return newRef.key!;
    },

    async updateMaster(id: string, data: Partial<QRMasterData>): Promise<void> {
        const masterRef = ref(database, `qr_masters/${id}`);
        await update(masterRef, {
            ...data,
            updatedAt: new Date().toISOString(),
        });
    },

    async deleteMaster(id: string): Promise<void> {
        const masterRef = ref(database, `qr_masters/${id}`);
        await remove(masterRef);
        // Also delete related products
        const productsRef = ref(database, 'qr_products');
        const productsQuery = query(productsRef, orderByChild('masterId'), equalTo(id));
        const snapshot = await get(productsQuery);
        if (snapshot.exists()) {
            const deletePromises: Promise<void>[] = [];
            snapshot.forEach((child) => {
                deletePromises.push(remove(child.ref));
            });
            await Promise.all(deletePromises);
        }
    },

    async getMaster(id: string): Promise<QRMasterData | null> {
        const masterRef = ref(database, `qr_masters/${id}`);
        const snapshot = await get(masterRef);
        return snapshot.exists() ? snapshot.val() : null;
    },

    async listMasters(activeOnly: boolean = false): Promise<QRMasterData[]> {
        const masterRef = ref(database, 'qr_masters');
        const snapshot = await get(masterRef);
        if (!snapshot.exists()) return [];

        const masters: QRMasterData[] = [];
        snapshot.forEach((child) => {
            const master = child.val() as QRMasterData;
            if (!activeOnly || master.isActive) {
                masters.push(master);
            }
        });
        return masters.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
};

// ================================
// QR PRODUCT SERVICE
// ================================

export const QRProductService = {
    async addProduct(data: Omit<QRProduct, 'id' | 'createdAt'>): Promise<string> {
        const productRef = ref(database, 'qr_products');
        const newRef = push(productRef);
        const product: QRProduct = {
            ...data,
            id: newRef.key!,
            createdAt: new Date().toISOString(),
        };
        await set(newRef, product);
        return newRef.key!;
    },

    async updateProduct(id: string, data: Partial<QRProduct>): Promise<void> {
        const productRef = ref(database, `qr_products/${id}`);
        await update(productRef, {
            ...data,
            updatedAt: new Date().toISOString(),
        });
    },

    async deleteProduct(id: string): Promise<void> {
        const productRef = ref(database, `qr_products/${id}`);
        await remove(productRef);
    },

    async getProduct(id: string): Promise<QRProduct | null> {
        const productRef = ref(database, `qr_products/${id}`);
        const snapshot = await get(productRef);
        return snapshot.exists() ? snapshot.val() : null;
    },

    async listProducts(masterId?: string, activeOnly: boolean = false): Promise<QRProduct[]> {
        const productRef = ref(database, 'qr_products');
        const snapshot = await get(productRef);
        if (!snapshot.exists()) return [];

        const products: QRProduct[] = [];
        snapshot.forEach((child) => {
            const product = child.val() as QRProduct;
            const matchesMaster = !masterId || product.masterId === masterId;
            const matchesActive = !activeOnly || product.isActive;
            if (matchesMaster && matchesActive) {
                products.push(product);
            }
        });
        return products.sort((a, b) => a.productName.localeCompare(b.productName));
    },
};

// ================================
// EMV QR ENCODE/DECODE UTILITIES
// ================================

/**
 * Calculate CRC16-CCITT checksum for EMV QR
 */
function calculateCRC16(data: string): string {
    let crc = 0xFFFF;
    const polynomial = 0x1021;

    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ polynomial;
            } else {
                crc <<= 1;
            }
        }
    }
    crc &= 0xFFFF;
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Create TLV field for EMV QR
 */
function createTLV(id: string, value: string): string {
    const length = value.length.toString().padStart(2, '0');
    return `${id}${length}${value}`;
}

/**
 * Parse TLV fields from EMV QR string
 */
function parseTLV(qrString: string): EMVQRField[] {
    const fields: EMVQRField[] = [];
    let pos = 0;

    while (pos < qrString.length) {
        if (pos + 4 > qrString.length) break;

        const id = qrString.substring(pos, pos + 2);
        const length = parseInt(qrString.substring(pos + 2, pos + 4), 10);

        if (isNaN(length) || pos + 4 + length > qrString.length) break;

        const value = qrString.substring(pos + 4, pos + 4 + length);
        fields.push({ id, length, value });
        pos += 4 + length;
    }

    return fields;
}

/**
 * Generate EMV QR string from master data and request
 */
export function generateEMVQRString(
    master: QRMasterData,
    product: QRProduct,
    amount: number,
    additionalData?: string
): string {
    let qrString = '';

    // ID 00: Payload Format Indicator (always "01")
    qrString += createTLV('00', '01');

    // ID 01: Point of Initiation Method
    // "11" = static, "12" = dynamic (with amount)
    qrString += createTLV('01', amount > 0 ? '12' : '11');

    // ID 26: Merchant Account Information (simplified)
    // Contains bank code + account number
    const accountInfo = `0010A000000775${createTLV('01', master.accountNumber)}`;
    qrString += createTLV('26', accountInfo);

    // ID 52: Merchant Category Code (MCC)
    qrString += createTLV('52', master.mcc.padStart(4, '0'));

    // ID 53: Transaction Currency (704 = VND)
    qrString += createTLV('53', '704');

    // ID 54: Transaction Amount (if provided)
    if (amount > 0) {
        qrString += createTLV('54', amount.toString());
    }

    // ID 58: Country Code
    qrString += createTLV('58', 'VN');

    // ID 59: Merchant Name
    qrString += createTLV('59', master.beneficiaryName.substring(0, 25));

    // ID 60: Merchant City
    qrString += createTLV('60', (master.merchantCity || 'VIETNAM').substring(0, 15));

    // ID 61: Postal Code (if provided)
    if (master.postalCode) {
        qrString += createTLV('61', master.postalCode);
    }

    // ID 62: Additional Data Field Template (optional)
    // Contains product info, purpose of transaction, etc.
    if (additionalData || product.productCode) {
        const addData = additionalData || `${product.productCode}|${product.productName}`;
        qrString += createTLV('62', createTLV('05', addData.substring(0, 50)));
    }

    // ID 63: CRC (calculated last, always 4 chars)
    qrString += '6304'; // Placeholder for CRC
    const crc = calculateCRC16(qrString);
    qrString = qrString.slice(0, -4) + crc;

    return qrString;
}

/**
 * Decode EMV QR string to parsed structure
 */
export function decodeEMVQRString(qrString: string): ParsedEMVQR | null {
    try {
        const fields = parseTLV(qrString);
        if (fields.length === 0) return null;

        const getField = (id: string): string => {
            const field = fields.find(f => f.id === id);
            return field ? field.value : '';
        };

        return {
            payloadFormatIndicator: getField('00'),
            pointOfInitiation: getField('01'),
            merchantAccountInfo: getField('26'),
            mcc: getField('52'),
            currency: getField('53'),
            amount: getField('54') || undefined,
            country: getField('58'),
            merchantName: getField('59'),
            merchantCity: getField('60'),
            postalCode: getField('61') || undefined,
            additionalData: getField('62') || undefined,
            crc: getField('63'),
            rawFields: fields,
        };
    } catch (error) {
        console.error('Error decoding EMV QR:', error);
        return null;
    }
}

/**
 * Validate EMV QR CRC
 */
export function validateEMVQRCRC(qrString: string): boolean {
    if (qrString.length < 8) return false;

    const dataWithoutCRC = qrString.slice(0, -4);
    const providedCRC = qrString.slice(-4);
    const calculatedCRC = calculateCRC16(dataWithoutCRC + '6304');

    return providedCRC.toUpperCase() === calculatedCRC;
}
