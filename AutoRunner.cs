using System;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;

class Program
{
    static void Main()
    {
        Console.Title = "AutoBib - Smart Server";
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("==========================================");
        Console.WriteLine("        AutoBib - Smart Auto Runner       ");
        Console.WriteLine("==========================================");
        Console.WriteLine();
        Console.ResetColor();

        string currentDir = AppDomain.CurrentDomain.BaseDirectory;
        Directory.SetCurrentDirectory(currentDir);

        if (!Directory.Exists("node_modules"))
        {
            Console.WriteLine("[!] Dependensi belum terinstall. Menginstall sekarang (harap tunggu)...");
            RunCommand("npm", "run install:all");
            Console.WriteLine();
        }

        Console.WriteLine("[1/3] Mengatur Sertifikat Keamanan SSL (Klik 'Yes' jika muncul peringatan)...");
        RunCommand("npx", "office-addin-dev-certs install");
        Console.WriteLine();

        Console.WriteLine("[2/3] Mendaftarkan Add-in ke Microsoft Word secara otomatis...");
        try
        {
            string manifestPath = Path.Combine(currentDir, "manifest.xml");
            string keyPath = @"Software\Microsoft\Office\16.0\WEF\Developer";
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(keyPath))
            {
                if (key != null)
                {
                    key.SetValue("815ccf8d-db32-45e5-aa06-d7168c74a009", manifestPath);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("Gagal mendaftarkan ke registry: " + ex.Message);
        }
        Console.WriteLine();

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("[3/3] Menyalakan Server Backend dan Frontend...");
        Console.WriteLine("==================================================");
        Console.WriteLine();
        Console.WriteLine("SERVER SEDANG BERJALAN. JANGAN TUTUP JENDELA INI!");
        Console.WriteLine("Anda bisa langsung membuka Microsoft Word 2021.");
        Console.WriteLine();
        Console.WriteLine("==================================================");
        Console.ResetColor();
        
        RunCommand("npm", "run dev");
    }

    static void RunCommand(string fileName, string arguments)
    {
        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = fileName + ".cmd";
        psi.Arguments = arguments;
        psi.UseShellExecute = false;
        
        try 
        {
            using (Process process = Process.Start(psi))
            {
                process.WaitForExit();
            }
        }
        catch
        {
            try 
            {
                psi.FileName = fileName;
                psi.UseShellExecute = true;
                using (Process process = Process.Start(psi))
                {
                    process.WaitForExit();
                }
            } 
            catch (Exception ex) 
            {
                Console.WriteLine("Error running " + fileName + ": " + ex.Message);
            }
        }
    }
}
