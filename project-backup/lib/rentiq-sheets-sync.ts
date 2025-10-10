import { google } from 'googleapis';

const SPREADSHEET_ID = '13LN-HxDoD7ND35fQ6_I6s8mi4BRxjP7FbJ5ACus4uy4';
const SHEET_NAME = 'RentIQ Pricing';

interface RentIQSheetsData {
  date: string
  current_occupancy: number
  total_units: number
  occupied_units: number
  target_occupancy: number
  rentiq_pool_count: number
  units_needed_for_95: number
  rentiq_active: boolean
  rentiq_units: Array<{
    unit: string
    tenant_status: string
    monthly_rent: number | null
    market_rent: number | null
    suggested_new_rent: number
    pricing_tier: string
    days_vacant: number
    assigned_category: string
    minimum_threshold: number
    cap_applied: boolean
  }>
}

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

async function getGoogleSheetsClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

export class RentIQSheetsSync {
  
  static async updateRentIQSheet(rentiqData: RentIQSheetsData): Promise<void> {
    try {
      console.log('[RENTIQ_SHEETS] Starting Google Sheets update...')
      
      const sheets = await getGoogleSheetsClient();
      
      // Prepare header rows
      const summaryHeaders = [
        ['RentIQ Pricing Report'],
        [`Generated: ${new Date(rentiqData.date).toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric' })}`],
        [],
        ['Summary Metrics', 'Value'],
        ['Current Occupancy', `${rentiqData.current_occupancy.toFixed(1)}%`],
        ['Total Units', rentiqData.total_units.toString()],
        ['Occupied Units', rentiqData.occupied_units.toString()],
        ['Target Occupancy', `${rentiqData.target_occupancy}%`],
        ['RentIQ Pool Count', rentiqData.rentiq_pool_count.toString()],
        ['Units Needed for 95%', rentiqData.units_needed_for_95.toString()],
        ['RentIQ Active', rentiqData.rentiq_active ? 'Yes' : 'No'],
        []
      ];
      
      // Prepare unit data headers
      const unitHeaders = [
        ['Unit', 'Current Status', 'Monthly Rent', 'Market Rent', 'Suggested New Rent', 'Pricing Tier', 'Days Vacant', 'Category', 'Min Threshold', 'Cap Applied']
      ];
      
      // Prepare unit data rows
      const unitRows = rentiqData.rentiq_units.map(unit => [
        unit.unit,
        unit.tenant_status,
        unit.monthly_rent ? `$${unit.monthly_rent.toLocaleString()}` : 'N/A',
        unit.market_rent ? `$${unit.market_rent.toLocaleString()}` : 'N/A',
        `$${unit.suggested_new_rent.toLocaleString()}`,
        unit.pricing_tier,
        unit.days_vacant.toString(),
        unit.assigned_category,
        `$${unit.minimum_threshold.toLocaleString()}`,
        unit.cap_applied ? 'Yes' : 'No'
      ]);
      
      // Combine all data
      const allData = [...summaryHeaders, ...unitHeaders, ...unitRows];
      
      // Check if sheet exists, create if not
      try {
        const sheetMetadata = await sheets.spreadsheets.get({
          spreadsheetId: SPREADSHEET_ID
        });
        
        const sheetExists = sheetMetadata.data.sheets?.some(
          (sheet: any) => sheet.properties?.title === SHEET_NAME
        );
        
        if (!sheetExists) {
          console.log('[RENTIQ_SHEETS] Creating new sheet...')
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
              requests: [{
                addSheet: {
                  properties: {
                    title: SHEET_NAME
                  }
                }
              }]
            }
          });
        }
      } catch (error) {
        console.error('[RENTIQ_SHEETS] Error checking/creating sheet:', error)
        throw error
      }
      
      // Clear existing data and write new data
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:Z1000`
      });
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: allData
        }
      });
      
      // Format the sheet for better readability
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: (await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }))
                    .data.sheets?.find((s: any) => s.properties?.title === SHEET_NAME)?.properties?.sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.2, green: 0.7, blue: 0.4 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'CENTER'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
              }
            },
            {
              repeatCell: {
                range: {
                  sheetId: (await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }))
                    .data.sheets?.find((s: any) => s.properties?.title === SHEET_NAME)?.properties?.sheetId,
                  startRowIndex: summaryHeaders.length,
                  endRowIndex: summaryHeaders.length + 1
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                    textFormat: { bold: true },
                    horizontalAlignment: 'LEFT'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
              }
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: (await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }))
                    .data.sheets?.find((s: any) => s.properties?.title === SHEET_NAME)?.properties?.sheetId,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: 10
                }
              }
            }
          ]
        }
      });
      
      console.log(`[RENTIQ_SHEETS] ✅ Successfully updated Google Sheet with ${rentiqData.rentiq_units.length} units`)
      
    } catch (error) {
      console.error('[RENTIQ_SHEETS] Failed to update Google Sheet:', error)
      throw error
    }
  }
}
