/**
 * Identity management commands
 * - create: Create a new identity
 * - show: Show current identity info
 * - export: Export identity to file
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import { Identity } from '@waku-chat/sdk';
import {
  saveIdentityToFile,
  loadIdentityFromFile,
  identityExists,
  bytesToHex,
} from '../utils/index.js';

export const identityCommand = new Command('identity')
  .description('Manage user identity');

/**
 * Create a new identity
 */
identityCommand
  .command('create')
  .description('Create a new identity')
  .option('-f, --force', 'Overwrite existing identity')
  .action(async (options) => {
    try {
      if (identityExists() && !options.force) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'An identity already exists. Do you want to overwrite it?',
            default: false,
          },
        ]);
        if (!confirm) {
          console.log('Aborted.');
          return;
        }
      }

      const { password, confirmPassword } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter a password to protect your identity:',
          mask: '*',
          validate: (input: string) => input.length >= 6 || 'Password must be at least 6 characters',
        },
        {
          type: 'password',
          name: 'confirmPassword',
          message: 'Confirm password:',
          mask: '*',
        },
      ]);

      if (password !== confirmPassword) {
        console.error('Passwords do not match.');
        process.exit(1);
      }

      console.log('Creating new identity...');
      const identity = Identity.create();
      await saveIdentityToFile(identity, password);

      console.log('\n✓ Identity created successfully!');
      console.log(`  User ID: ${identity.userId}`);
      console.log(`  Public Key: ${bytesToHex(identity.publicKey)}`);
    } catch (error) {
      console.error('Error creating identity:', (error as Error).message);
      process.exit(1);
    }
  });


/**
 * Show current identity info
 */
identityCommand
  .command('show')
  .description('Show current identity information')
  .action(async () => {
    try {
      if (!identityExists()) {
        console.log('No identity found. Create one with: waku-chat identity create');
        return;
      }

      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter your password:',
          mask: '*',
        },
      ]);

      const identity = await loadIdentityFromFile(password);

      console.log('\n=== Identity Information ===');
      console.log(`User ID:    ${identity.userId}`);
      console.log(`Public Key: ${bytesToHex(identity.publicKey)}`);
    } catch (error) {
      console.error('Error loading identity:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Export identity to a file
 */
identityCommand
  .command('export')
  .description('Export identity to a file')
  .argument('<file>', 'Output file path')
  .action(async (file: string) => {
    try {
      if (!identityExists()) {
        console.log('No identity found. Create one with: waku-chat identity create');
        return;
      }

      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter your password:',
          mask: '*',
        },
      ]);

      const identity = await loadIdentityFromFile(password);
      
      const { exportPassword, confirmExportPassword } = await inquirer.prompt([
        {
          type: 'password',
          name: 'exportPassword',
          message: 'Enter a password for the exported file:',
          mask: '*',
          validate: (input: string) => input.length >= 6 || 'Password must be at least 6 characters',
        },
        {
          type: 'password',
          name: 'confirmExportPassword',
          message: 'Confirm export password:',
          mask: '*',
        },
      ]);

      if (exportPassword !== confirmExportPassword) {
        console.error('Passwords do not match.');
        process.exit(1);
      }

      const exported = await identity.export(exportPassword);
      const fs = await import('fs');
      fs.writeFileSync(file, exported, 'utf-8');

      console.log(`\n✓ Identity exported to: ${file}`);
    } catch (error) {
      console.error('Error exporting identity:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Import identity from a file
 */
identityCommand
  .command('import')
  .description('Import identity from a file')
  .argument('<file>', 'Input file path')
  .action(async (file: string) => {
    try {
      const fs = await import('fs');
      if (!fs.existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }

      if (identityExists()) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'An identity already exists. Do you want to overwrite it?',
            default: false,
          },
        ]);
        if (!confirm) {
          console.log('Aborted.');
          return;
        }
      }

      const { importPassword } = await inquirer.prompt([
        {
          type: 'password',
          name: 'importPassword',
          message: 'Enter the password for the imported file:',
          mask: '*',
        },
      ]);

      const data = fs.readFileSync(file, 'utf-8');
      const identity = await Identity.import(data, importPassword);

      const { newPassword, confirmNewPassword } = await inquirer.prompt([
        {
          type: 'password',
          name: 'newPassword',
          message: 'Enter a new password to protect your identity:',
          mask: '*',
          validate: (input: string) => input.length >= 6 || 'Password must be at least 6 characters',
        },
        {
          type: 'password',
          name: 'confirmNewPassword',
          message: 'Confirm new password:',
          mask: '*',
        },
      ]);

      if (newPassword !== confirmNewPassword) {
        console.error('Passwords do not match.');
        process.exit(1);
      }

      await saveIdentityToFile(identity, newPassword);

      console.log('\n✓ Identity imported successfully!');
      console.log(`  User ID: ${identity.userId}`);
    } catch (error) {
      console.error('Error importing identity:', (error as Error).message);
      process.exit(1);
    }
  });
