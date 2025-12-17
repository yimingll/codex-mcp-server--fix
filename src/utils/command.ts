import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { CommandExecutionError } from '../errors.js';
import { type CommandResult } from '../types.js';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// Escape argument for Windows cmd.exe shell
function escapeWinArg(arg: string): string {
  // If arg contains spaces or special characters, wrap in double quotes
  // and escape internal double quotes
  if (/[\s"&|<>^]/.test(arg) || arg.includes('和')) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

export async function executeCommand(
  file: string,
  args: string[] = []
): Promise<CommandResult> {
  try {
    const isWindows = process.platform === 'win32';

    console.error(chalk.blue('Executing:'), file, args.join(' '));

    let result: { stdout: string; stderr: string };

    if (isWindows) {
      // On Windows, use exec with properly escaped command string
      // to handle Unicode characters and complex argument patterns
      const escapedArgs = args.map(escapeWinArg);
      const command = `${file} ${escapedArgs.join(' ')}`;
      console.error(chalk.blue('Windows command:'), command);
      result = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024, // 10MB
        windowsHide: true,
      });
    } else {
      // On Unix, execFile works correctly without shell
      result = await execFileAsync(file, args, {
        shell: false,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
    }

    if (result.stderr) {
      console.error(chalk.yellow('Command stderr:'), result.stderr);
    }

    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error: unknown) {
    // If command failed but produced stdout, treat it as success
    // This handles cases where codex exits with error code but still returns valid output
    if (error && typeof error === 'object' && 'stdout' in error) {
      const execError = error as { stdout: string; stderr?: string };
      if (execError.stdout) {
        console.error(
          chalk.yellow('Command failed but produced output, using stdout')
        );
        return {
          stdout: execError.stdout,
          stderr: execError.stderr || '',
        };
      }
    }
    throw new CommandExecutionError(
      [file, ...args].join(' '),
      'Command execution failed',
      error
    );
  }
}
